#!/usr/bin/env python3
"""
Finds all .asScoped() calls with only one argument (missing opts) in TypeScript files,
adds { projectRouting: 'origin-only' } as the second argument, and inserts a
// TODO [CPS routing] comment above each call site.

Usage:
  python3 scripts/cps_make_mandatory.py [file1.ts file2.ts ...]
  # or: provide no args to process all discovered files via stdin (one per line)

Skips:
  - The two cluster_client.ts implementation files
  - Files ending in .d.ts
  - Lines that are mock/stub implementations (e.g. `jest.fn()`, `mockImplementation`)
"""

import sys
import os
import re

TODO_COMMENT = (
    '// TODO [CPS routing]: this client currently preserves the existing "origin-only" behavior.\n'
    '//   Review and choose one of the following options:\n'
    '//   A) Still unsure? Leave this comment as-is.\n'
    '//   B) Confirmed origin-only is correct? Replace this TODO with a concise explanation of why.\n'
    "//   C) Want to route within the current space? Change 'origin-only' to 'space' and remove this comment.\n"
    "//      Note: 'space' requires the request passed to asScoped() to carry a `url: URL` property."
)

SKIP_PATHS = {
    'src/core/packages/elasticsearch/client-server-internal/src/cluster_client.ts',
    'src/core/packages/elasticsearch/server/src/client/cluster_client.ts',
}


def find_matching_paren(text: str, start: int) -> int:
    """Given text and the index of '(', returns the index of the matching ')'."""
    depth = 0
    i = start
    in_string = None
    while i < len(text):
        ch = text[i]
        if in_string:
            if ch == '\\':
                i += 2
                continue
            if ch == in_string:
                in_string = None
        else:
            if ch in ('"', "'", '`'):
                in_string = ch
            elif ch == '(':
                depth += 1
            elif ch == ')':
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    return -1


def count_top_level_args(text: str, open_paren: int, close_paren: int) -> int:
    """Count the number of top-level arguments between matching parens."""
    depth = 0
    in_string = None
    arg_count = 1
    i = open_paren + 1
    if i >= close_paren:
        return 0  # empty call
    while i < close_paren:
        ch = text[i]
        if in_string:
            if ch == '\\':
                i += 2
                continue
            if ch == in_string:
                in_string = None
        else:
            if ch in ('"', "'", '`'):
                in_string = ch
            elif ch in ('(', '[', '{'):
                depth += 1
            elif ch in (')', ']', '}'):
                depth -= 1
            elif ch == ',' and depth == 0:
                arg_count += 1
        i += 1
    return arg_count


NON_ES_ASSCOPED_PATTERN = re.compile(r'(?:audit|auditService)\??\.asScoped\(')


def is_likely_mock_line(line: str) -> bool:
    """Heuristic: skip lines that look like mock/stub implementations rather than real calls."""
    stripped = line.strip()
    # Mock implementations often assign jest.fn(), mockReturnValue, etc.
    mock_patterns = [
        'jest.fn()',
        'mockImplementation',
        'mockReturnValue',
        'mockResolvedValue',
        'mockRejectedValue',
        '= jest.',
        'vi.fn()',
        'sinon.',
        'asScoped: ',       # property definition in a mock object
        'asScoped: jest',
    ]
    return any(p in stripped for p in mock_patterns)


def is_non_es_asscoped(content: str, idx: int) -> bool:
    """Returns True if the asScoped call at idx is on a non-ES service (e.g., audit)."""
    # Look up to 60 chars before .asScoped( to identify the receiver
    prefix = content[max(0, idx - 60):idx + 10]
    return bool(NON_ES_ASSCOPED_PATTERN.search(prefix))


def is_test_file(filepath: str) -> bool:
    """Returns True for test files that should get just opts, not a TODO comment."""
    return '.test.' in filepath or '.spec.' in filepath or '/test/' in filepath


def process_file(filepath: str) -> int:
    """Process a single file. Returns number of modifications made."""
    # Normalize path for comparison
    norm = filepath.replace('\\', '/')
    if any(norm.endswith(skip) for skip in SKIP_PATHS):
        return 0
    is_test = is_test_file(norm)

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except (IOError, UnicodeDecodeError):
        return 0

    # Work line by line; find asScoped( occurrences
    lines = content.split('\n')
    modifications = 0

    # We'll rebuild line-by-line, inserting comment lines where needed.
    # To handle multi-line calls, we need to process the whole content.
    # Strategy: scan for '.asScoped(' in the content string, find its args,
    # and if there's only 1 arg, patch it.

    i = 0
    patches: list[tuple[int, int, str]] = []  # (start, end, replacement)

    while i < len(content):
        idx = content.find('.asScoped(', i)
        if idx == -1:
            break

        # Find the matching closing paren
        open_paren = idx + len('.asScoped(') - 1  # index of '('
        close_paren = find_matching_paren(content, open_paren)
        if close_paren == -1:
            i = idx + 1
            continue

        # Determine line of the .asScoped( call
        line_start = content.rfind('\n', 0, idx) + 1
        call_line = content[line_start:content.find('\n', idx)]

        if is_likely_mock_line(call_line):
            i = idx + 1
            continue

        if is_non_es_asscoped(content, idx):
            i = idx + 1
            continue

        arg_count = count_top_level_args(content, open_paren, close_paren)

        if arg_count == 1:
            # Need to add second argument and optionally a TODO comment

            # Determine indentation from the call line
            indent = len(call_line) - len(call_line.lstrip())
            indent_str = ' ' * indent

            # Patch 1: insert opts before close paren
            inner = content[open_paren + 1:close_paren].strip()
            if inner:
                new_call = content[open_paren + 1:close_paren] + ", { projectRouting: 'origin-only' }"
            else:
                # Empty call - unusual, but handle it
                new_call = "{ projectRouting: 'origin-only' }"

            patches.append((open_paren + 1, close_paren, new_call))

            # Patch 2: for production files, also insert a TODO comment before the line
            if not is_test:
                comment_lines = [indent_str + line for line in TODO_COMMENT.split('\n')]
                comment_block = '\n'.join(comment_lines)
                patches.append((line_start, line_start, comment_block + '\n'))

            modifications += 1

        i = close_paren + 1

    if not patches:
        return 0

    # Apply patches in reverse order to preserve offsets
    patches.sort(key=lambda p: p[0], reverse=True)
    result = content
    for start, end, replacement in patches:
        result = result[:start] + replacement + result[end:]

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(result)

    return modifications


if __name__ == '__main__':
    files = sys.argv[1:] if len(sys.argv) > 1 else [line.strip() for line in sys.stdin]
    total = 0
    for filepath in files:
        if not filepath:
            continue
        n = process_file(filepath)
        if n > 0:
            print(f'  {n} change(s): {filepath}')
            total += n
    print(f'\nTotal: {total} asScoped() call sites updated.')

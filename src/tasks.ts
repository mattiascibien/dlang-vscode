'use strict';

export default {
    'version': '0.1.0',
    'command': 'dub',
    'isShellCommand': true,
    'showOutput': 'silent',
    'options': {
        'env': {
            'LANG': 'C'
        }
    },
    'tasks': [
        {
            'taskName': 'build',
            'isBuildCommand': true,
            'args': [
                '--compiler=dmd'
            ],
            'problemMatcher': {
                'fileLocation': [
                    'relative',
                    '${workspaceRoot}'
                ],
                'pattern': {
                    'regexp': '^(.+\\.di?)[\\D](\\d+)(,|:)?(\\d+)?\\S+\\s+([Ee]rror|[Ww]arning):\\s+(.+)$',
                    'file': 1,
                    'line': 2,
                    'column': 4,
                    'severity': 5,
                    'message': 6
                }
            },
        },
        {
            'taskName': 'run'
        },
        {
            'taskName': 'test',
            'isTestCommand': true,
            'problemMatcher': {
                'fileLocation': [
                    'relative',
                    '${workspaceRoot}'
                ],
                'pattern': {
                    'regexp': '^.+@(.+\\.di?)\\((\\d+)\\S+\\s+(.+)$',
                    'file': 1,
                    'line': 2,
                    'message': 3
                }
            }
        },
        {
            'taskName': 'clean'
        }
    ]
};
'use strict';

import * as path from 'path';
import * as cp from 'child_process';
import * as vsc from 'vscode';

export default class DProfileViewer {
    public static path: string;

    public constructor(directory: string, resolve: Function) {
        cp.spawn(path.join(DProfileViewer.path, 'd-profile-viewer'), [], {
            cwd: directory
        }).on('exit', resolve);
    }
};
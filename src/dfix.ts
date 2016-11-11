'use strict';

import * as path from 'path';
import * as cp from 'child_process';

export default class Dfix {
    public static toolDirectory = '';
    public static toolFile = '';

    public constructor(fileOrDir: string) {
        cp.spawn(path.join(Dfix.toolDirectory, Dfix.toolFile), [fileOrDir]);
    }
};
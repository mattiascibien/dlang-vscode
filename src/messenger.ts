'use strict';

import * as vsc from 'vscode';

let operations = new Map<string, Set<string>>();
let message: vsc.Disposable;

export function add(category: string, data: string) {
    if (!operations.has(category)) {
        operations.set(category, new Set());
    }

    operations.get(category).add(data);
    updateMessage();
};

export function remove(category: string, data: string) {
    let op = operations.get(category);

    if (op) {
        op.delete(data);

        if (operations.get(category).size == 0) {
            operations.delete(category);
        }

        updateMessage();
    }
};

function updateMessage() {
    let msg: string;

    operations.forEach((values, category) => {
        if (!msg) {
            msg = '';
        } else {
            msg += ' | ';
        }

        msg += category + ': ';

        let part: string;

        values.forEach((data) => {
            if (!part) {
                part = '';
            } else {
                part += ', ';
            }

            part += data;
        });

        msg += part;
    });

    if (message) {
        message.dispose();
    }

    if (msg) {
        message = vsc.window.setStatusBarMessage(msg);
    }
}
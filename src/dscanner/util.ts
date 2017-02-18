'use strict';

import * as vsc from 'vscode';
import Dscanner from './dscanner';
import { D_MODE } from '../mode';

export enum Operation {
    Lint,
    DocumentSymbols,
    WorkspaceSymbols
};

let fixes = new Map<string, {
    command?: vsc.Command,
    diagnostic?: vsc.Diagnostic,
    checkName?: string,
    getArgs?: (document: vsc.TextDocument, range: vsc.Range) => any[],
    action?: (textEditor: vsc.TextEditor, edit: vsc.TextEditorEdit,
        diagnostic: vsc.Diagnostic, ...args: any[]) => void
}>();

fixes.set('dscanner.bugs.backwards_slices', { checkName: 'backwards_range_check' });
fixes.set('dscanner.bugs.if_else_same', { checkName: 'if_else_same_check' });
fixes.set('dscanner.confusing.argument_parameter_mismatch', { checkName: 'mismatched_args_check' });
fixes.set('dscanner.confusing.brexp', { checkName: 'asm_style_check' });
fixes.set('dscanner.confusing.builtin_property_names', { checkName: 'builtin_property_names_check' });
fixes.set('dscanner.confusing.constructor_args', { checkName: 'constructor_check' });
fixes.set('dscanner.confusing.function_attributes', { checkName: 'function_attribute_check' });
fixes.set('dscanner.confusing.lambda_returns_lambda', { checkName: 'lambda_return_check' });
fixes.set('dscanner.confusing.logical_precedence', { checkName: 'logical_precedence_check' });
fixes.set('dscanner.confusing.struct_constructor_default_args', { checkName: 'constructor_check' });
fixes.set('dscanner.deprecated.floating_point_operators', { checkName: 'float_operator_check' });
fixes.set('dscanner.if_statement', { checkName: 'redundant_if_check' });
fixes.set('dscanner.performance.enum_array_literal', { checkName: 'enum_array_literal_check' });
fixes.set('dscanner.style.explicitly_annotated_unittest', { checkName: 'explicitly_annotated_unittests' });
fixes.set('dscanner.style.long_line', { checkName: 'long_line_check' });
fixes.set('dscanner.style.number_literals', { checkName: 'number_style_check' });
fixes.set('dscanner.style.phobos_naming_convention', { checkName: 'style_check' });
fixes.set('dscanner.style.undocumented_declaration', { checkName: 'undocumented_declaration_check' });
fixes.set('dscanner.suspicious.auto_ref_assignment', { checkName: 'auto_ref_assignment_check' });
fixes.set('dscanner.suspicious.catch_em_all', { checkName: 'exception_check' });
fixes.set('dscanner.suspicious.comma_expression', { checkName: 'comma_expression_check' });
fixes.set('dscanner.suspicious.incomplete_operator_overloading', { checkName: 'opequals_tohash_check' });
fixes.set('dscanner.suspicious.incorrect_infinite_range', { checkName: 'incorrect_infinite_range_check' });
fixes.set('dscanner.suspicious.label_var_same_name', { checkName: 'label_var_same_name_check' });
fixes.set('dscanner.suspicious.length_subtraction', { checkName: 'length_subtraction_check' });
fixes.set('dscanner.suspicious.local_imports', { checkName: 'local_import_check' });
fixes.set('dscanner.suspicious.missing_return', { checkName: 'auto_function_check' });
fixes.set('dscanner.suspicious.object_const', { checkName: 'object_const_check' });
fixes.set('dscanner.suspicious.redundant_parens', { checkName: 'redundant_parens_check' });
fixes.set('dscanner.suspicious.static_if_else', { checkName: 'static_if_else_check' });
fixes.set('dscanner.suspicious.unmodified', { checkName: 'could_be_immutable_check' });
fixes.set('dscanner.suspicious.unused_label', { checkName: 'unused_label_check' });
fixes.set('dscanner.suspicious.unused_parameter', { checkName: 'unused_variable_check' });
fixes.set('dscanner.suspicious.unused_variable', { checkName: 'unused_variable_check' });
fixes.set('dscanner.suspicious.useless_assert', { checkName: 'useless_assert_check' });
fixes.set('dscanner.unnecessary.duplicate_attribute', { checkName: 'duplicate_attribute' });
fixes.set('dscanner.useless.final', { checkName: 'final_attribute_check' });

fixes.set('dscanner.deprecated.delete_keyword', {
    checkName: 'delete_check',
    command: {
        title: 'Replace `delete` With `destroy()`',
        command: 'dlang.actions.replaceDeletes'
    },
    getArgs: (document, range) => [range],
    action: (editor, edit, diagnostic: vsc.Diagnostic, range: vsc.Range) => {
        if (range) {
            let match = editor.document.lineAt(range.start).text.match(/delete\s+(\w+)/);
            let fullRange = new vsc.Range(range.start,
                new vsc.Position(range.start.line, range.start.character + match[0].length));

            edit.replace(fullRange, `destroy(${match[1]})`);
            eraseDiagnostic(editor, diagnostic);
        }
    }
});

fixes.set('dscanner.style.alias_syntax', {
    checkName: 'alias_syntax_check',
    command: {
        title: 'Run Dfix',
        command: 'dlang.actions.dfix'
    },
    getArgs: (document, range) => [document.uri]
});

fixes.set('dscanner.style.imports_sortedness', {
    checkName: 'imports_sortedness',
    command: {
        title: 'Sort Imports',
        command: 'dlang.actions.sortImports'
    },
    getArgs: (document, range) => [range],
    action: (editor, edit, diagnostic: vsc.Diagnostic, range: vsc.Range) => {
        if (range) {
            let startLineNum = range.start.line;
            let numberedLines = new Map<number, vsc.TextLine>();
            let line: vsc.TextLine;
            let linesAdded = true;

            numberedLines.set(startLineNum, editor.document.lineAt(startLineNum));

            for (let i = 1; linesAdded; ++i) {
                linesAdded = false;

                for (let sign = -1; sign <= 1; sign += 2) {
                    if (startLineNum + sign * i >= 0
                        && startLineNum + sign * i < editor.document.lineCount) {
                        line = editor.document.lineAt(startLineNum + sign * i);

                        if (line.text.match(/\s*import\s+[\w.]+\s*;\s*/)) {
                            numberedLines.set(startLineNum + sign * i,
                                editor.document.lineAt(startLineNum + sign * i));
                            linesAdded = true;
                        }
                    }
                }
            }

            let numbers = Array.from(numberedLines.keys()).sort();
            let lines = Array.from(numberedLines.values())
                .sort((a, b) => a.text.localeCompare(b.text));

            numbers.forEach((n, i) => edit.replace(numberedLines.get(n).range, lines[i].text));
            eraseDiagnostic(editor, diagnostic);
        }
    }
});

export { fixes };

export function lintDocument(document: vsc.TextDocument) {
    if (document.languageId === D_MODE.language) {
        new Dscanner(document, null, Operation.Lint);
    }
};

function eraseDiagnostic(editor: vsc.TextEditor, diagnostic: vsc.Diagnostic) {
    Dscanner.collection.set(editor.document.uri,
        Dscanner.collection.get(editor.document.uri)
            .filter((d) => d !== diagnostic));
}
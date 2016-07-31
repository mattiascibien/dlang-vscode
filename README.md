# D Support for [Visual Studio Code](https://code.visualstudio.com/)

[![Build Status (Linux)](https://img.shields.io/travis/dlang-vscode/dlang-vscode.svg?style=flat-square)](https://travis-ci.org/dlang-vscode/dlang-vscode) 
[![Dependency Status](https://www.versioneye.com/user/projects/57168066fcd19a0051855e77/badge.svg?style=flat)](https://www.versioneye.com/user/projects/57168066fcd19a0051855e77)

D Language Page: https://dlang.org/

## Features

 * Syntax Colorization
 * Snippets
 * Autocompletion using [DCD](https://github.com/Hackerpilot/dcd)
 * Formatting using [Dfmt](https://github.com/Hackerpilot/dfmt)
 * Linting using [Dscanner](https://github.com/Hackerpilot/dscanner)
 * Code upgrade using [dfix](https://github.com/Hackerpilot/dfix)

In order to use DCD, dfmt, dscanner and dfix you must have [Dub](https://github.com/D-Programming-Language/dub) installed on your system.
Dub will then fetch, build and use the packages automatically.

Though this extension lacks a debugger integration, debugging can easily be done using the general purpose [Debug](https://github.com/WebFreak001/code-debug) extension.

## Extension Settings

* `d.dub`: Path to the `dub` executable
* `d.dmdConf.linux`: Path to the dmd configuration file on Linux
* `d.dmdConf.osx`: Path to the dmd configuration file on OS X
* `d.dmdConf.windows`: Path to the dmd configuration file on Windows

## Extension Commands

* `Create Default Tasks`: creates a default tasks.json file for VSCode containing standard dub tasks such as `build`, `run`, `test` and `clean`
* `Run Dfix`: runs dfix on either the currently opened files or the entire workspace
* `Init Package`: creates a new dub package in the current directory
* `Fetch Package`: fetches a dub package
* `Remove Package`: removes a dub package
* `Upgrade Package Dependencies`: upgrade a package's dependencies
* `Convert Dub File Format`: converts dub.json to SDL format or dub.sdl to JSON format

## TODO

 * Documentation display
 * Add range formatting
 * [Diet template](http://vibed.org/features#diet-templates) support
 * Code actions for fixing problems from linter
 * Symbol highlighting/renaming

## Original code

This extension derives from the original TextMate bundle for D located [here](https://github.com/textmate/d.tmbundle)

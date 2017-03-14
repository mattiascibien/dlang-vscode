# D Support for [Visual Studio Code](https://code.visualstudio.com/)

[![Build Status (Linux)](https://img.shields.io/travis/dlang-vscode/dlang-vscode.svg?style=flat-square)](https://travis-ci.org/dlang-vscode/dlang-vscode)
[![Build Status (Windows)](https://ci.appveyor.com/api/projects/status/github/dlang-vscode/dlang-vscode?branch=master&svg=true)](https://ci.appveyor.com/project/mattiascibien/dlang-vscode)
[![Dependency Status](https://www.versioneye.com/user/projects/58c669be01c96a0052f17bdf/badge.svg?style=flat-square)](https://www.versioneye.com/user/projects/58c669be01c96a0052f17bdf)

D Language Page: https://dlang.org/

## Features

* Syntax Colorization
* Snippets
* Autocompletion and code navigation using [DCD](https://github.com/Hackerpilot/dcd)
* Formatting using [DFMT](https://github.com/Hackerpilot/dfmt)
* Linting using [Dscanner](https://github.com/Hackerpilot/dscanner) with code actions for quick check disabling and automatic fixing for :
  * Deprecated alias syntax
  * Deprecated use of `delete`
  * Imports not being sorted
* Code upgrade using [Dfix](https://github.com/Hackerpilot/dfix)
* Profiling using [D Profile Viewer](https://bitbucket.org/andrewtrotman/d-profile-viewer)
* Integration with Dub using VSCode commands and tasks
* [Dustmite](https://github.com/CyberShadow/DustMite/wiki) integration

In order to use DCD, dfmt, Dscanner, dfix and D Profile Viewer you must have [Dub](https://github.com/D-Programming-Language/dub#installation) installed on your system.
Dub will then fetch, build and use the packages automatically.

Though this extension lacks a debugger integration, debugging can easily be done using the general purpose [Debug](https://github.com/WebFreak001/code-debug) extension.
After creating a debug configuration and the default dub tasks, simply change the name of the executable and add `"preLaunchTask": "build"` to build the project when debugging.

## Extension Settings

* `d.dmdConf.linux`: Path to the dmd configuration file on Linux. Default value: `/etc/dmd.conf`
* `d.dmdConf.osx`: Path to the dmd configuration file on OS X. Default value: `/usr/local/etc/dmd.conf`
* `d.dmdConf.windows`: Path to the dmd configuration file on Windows. Default value: `C:\\D\\dmd2\\windows\\bin\\sc.ini`
* `d.tools.enabled.dcd`: Whether DCD is used or not. Default value: `true`
* `d.tools.enabled.dfmt`: Whether DFMT is used or not. Default value: `true`
* `d.tools.enabled.dscanner`: Whether Dscanner is used or not. Default value: `true`
* `d.tools.enabled.dfix`: Whether Dfix is used or not. Default value: `true`
* `d.tools.enabled.dProfileViewer`: Whether D Profile Viewer is used or not. Default value: `true`
* `d.tools.dub`: Path to the `dub` executable. Default value: `dub`
* `d.tools.dcd.client`: Path to the system DCD client executable (optional).
* `d.tools.dcd.server`: Path to the system DCD server executable (optional).
* `d.tools.dfmt`: Path to the system DFMT executable (optional).
* `d.tools.dscanner`: Path to the system Dscanner executable (optional).
* `d.tools.dfix`: Path to the system Dfix executable (optional).
* `d.dub.compiler`: The compiler used by dub when compiling other tools. Possible values:
  * `dmd` [default]
  * `ldc2`
  * `gdc`
* `d.tools.dProfileViewer`: Path to the system D Profile Viewer executable (optional).
* `d.dcd.compiler`: The compiler used by dub when compiling DCD. Possible values:
  * `dmd`
  * `ldc2`
  * `gdc`
* `d.dcd.tcp`: Listen on a TCP socket instead of a UNIX domain socket. This switch has no effect on Windows. Default value: `false`
* `d.dcd.port`: Listens on this port instead of the default port 9166 when TCP sockets are used. Default value: `9166`
* `d.dcd.imports`: An array of paths that DCD should import on launch. Default value: `[]`
* `d.dfmt.compiler`: The compiler used by dub when compiling DFMT. Possible values:
  * `dmd`
  * `ldc2`
  * `gdc`
* `d.dfmt.alignSwitchStatements`: Align labels, cases, and defaults with their enclosing switch. Default value: `true`
* `d.dfmt.braceStyle`: Denotes the style for using curly braces in code blocks. Possible values:
  * `allman` [default]
  * `otbs`
  * `stroustrup`
* `d.dfmt.endOfLine`: Line ending file format. Possible values:
  * `lf` [default]
  * `cr`
  * `crlf`
* `d.dfmt.softMaxLineLength`: The formatting process will usually keep lines below this length. Default value: `80`
* `d.dfmt.maxLineLength`: Forces hard line wrapping after the amount of characters specified. Default value: `120`
* `d.dfmt.outdentAttributes`: Decrease the indentation level of attributes. Default value: `true`
* `d.dfmt.spaceAfterCast`: Insert space after the closing parenthesis of a cast expression. Default value: `true`
* `d.dfmt.selectiveImportSpace`: Insert space after the module name and before the ':' for selective imports. Default value: `true`
* `d.dfmt.splitOperatorAtLineEnd`: Place operators on the end of the previous line when splitting lines. Default value: `false`
* `d.dfmt.compactLabeledStatements`: Place labels on the same line as the labeled switch, for, foreach, or while statement. Default value: `true`
* `d.dscanner.compiler`: The compiler used by dub when compiling Dscanner. Possible values:
  * `dmd`
  * `ldc2`
  * `gdc`
* `d.dfix.compiler`: The compiler used by dub when compiling Dfix. Possible values:
  * `dmd`
  * `ldc2`
  * `gdc`
* `d.dProfileViewer.compiler`: The compiler used by dub when compiling D Profile Viewer. Possible values:
  * `dmd`
  * `ldc2`
  * `gdc`

Note: these dfmt formatting options have yet to be implemented in dfmt itself and won't affect formatting for now:
* `d.dfmt.alignSwitchStatements`
* `d.dfmt.outdentAttributes`

## Extension Commands

* `Create Default Tasks`: creates a default tasks.json file for VSCode containing standard dub tasks such as `build`, `run`, `test` and `clean`
* `Run Dfix`: runs dfix on either the currently opened files or the entire workspace
* `See Program Profile`: runs d-profile-viewer and displays the profiling results as a HTML page
* `Init Package`: creates a new dub package in the current directory
* `Fetch Package`: fetches a dub package
* `Remove Package`: removes a dub package
* `Upgrade Package Dependencies`: upgrade a package's dependencies
* `Convert Dub File Format`: converts dub.json to SDL format or dub.sdl to JSON format
* `Dustmite`: tries to build the project and sends the compiler output to Dustmite
* `Install Tools`: shows tools that can be installed automatically

Commands in the `Dlang Actions` group are meant for automatic problem fixing.

## Manual installation

You have to install [the SDLang extension](https://marketplace.visualstudio.com/items?itemName=LaurentTreguier.sdlang) in order to get dlang-vscode to work (it is an extension depency).

```sh
git clone https://github.com/dlang-vscode/dlang-vscode
git checkout development # if you want to install the latest development version
cd dlang-vscode
npm install
vsce package
code dlang-<version>.vsix
```

## Troubleshooting

* Error when building tools at extension startup: some tools don't compile with the latest DMD versions. Solutions:
  * Setting the `d.*.compiler` user options to `ldc2` or `gdc`
  * Downgrading your version of DMD to 2.071.x
  * Disabling the tool that doesn't compile with `d.tools.enabled.*`
* Currently, the latest stable versions of some tools used are quite old and may have some bugs that have only been fixed in the git HEAD version.

## TODO

* Code coverage
* GC profiling
* Range formatting
* Symbol highlighting/renaming

## Original code

This extension derives from the original TextMate bundle for D located [here](https://github.com/textmate/d.tmbundle)

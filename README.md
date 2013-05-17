blinkc
======

blinkc.js generates source code from one ore more blink schemas. The
tool is modular and will eventually support multiple output
formats. Currently only Java is supported.

You run blinkc using nodejs like such:

    nodejs blinkc.js -m java my.blink -p org.example -o src

This example will create Java classes for the definitions found in
`my.blink`. The classes will appear in the package `org.example` and
the `.java` files will be placed in directory structure matching the
package under the target directory `src`.

You may specify `-h/--help` to `blinkc.js` to get a description of the
available options.

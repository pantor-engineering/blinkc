// Copyright (c) 2013, Pantor Engineering AB
//
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions
// are met:
//
//  * Redistributions of source code must retain the above copyright
//    notice, this list of conditions and the following disclaimer.
//
//  * Redistributions in binary form must reproduce the above
//    copyright notice, this list of conditions and the following
//    disclaimer in the documentation and/or other materials provided
//    with the distribution.
//
//  * Neither the name of Pantor Engineering AB nor the names of its
//    contributors may be used to endorse or promote products derived
//    from this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
// "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
// LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS
// FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
//
// IN NO EVENT SHALL THE COPYRIGHT HOLDERS OR CONTRIBUTORS BE LIABLE
// FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT
// OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR
// BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
// LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE
// USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH
// DAMAGE.

var util = require ("./util");
var schema = require ("./schema");

var BootCl = [
   "blinkc.js",
   "  -m/--method <method>   # Output method: java, cpp, ...",
   "  [-o/--output <target>] # Output file or directory depending on method",
   "  [-v/--verbose...]      # Verbosity level, repeat for increased level",
   "  [schema ...]           # Schema files to process"
];

var cl = util.parseCmdLine (BootCl, {
   ignoreUnknowns: true, disableHelp: true 
});

var method = cl.get ("method");
var mod = loadMod ("./" + method) || loadMod (method);

if (mod)
{
   if (cl.count ("verbose") > 0)
      console.error ("Loading output module: " + require.resolve (method));
   mod.start (cl, loadSchemas);
}
else
{
   console.error ("No such output method: " + cl.get ("method"));
   process.exit (1);
}

function loadSchemas (arg1, arg2)
{
   var schemas = arg2 ? arg1 : false;
   var onLoaded = arg2 || arg1;

   if (schemas)
      transform (schema.create (schemas));
   else
   {
      var data = "";
      process.stdin.resume ();
      process.stdin.on ("data", function (d) { data += d });
      process.stdin.on ("end", function () { 
         var s = new schema.Schema ();
         s.readFromString (data);
         transform (s);
      });
   }

   function transform (s)
   {
      s.finalize ();
      onLoaded (s);
   }
}

function loadMod (mod)
{
   try
   {
      return require (mod);
   }
   catch (e)
   {
      if (e.code == "MODULE_NOT_FOUND" && util.endsWith (e + "", method + "'"))
         return false;
      else
         throw e;
   }
}

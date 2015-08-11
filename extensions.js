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

"use strict"

// ----------------------------------------------------------------------
//
// This module sets up extensions that add to or modifies the Node.js
// runtime environment and it doesn't provide any interface.
//
// ----------------------------------------------------------------------

// Add a povide method to the module class so you can do
// module.provide (fn ...)

if (module.constructor !== Object)
   module.constructor.prototype.provide = function () {
      var ex = this.exports;
      toArray (arguments).forEach (function (arg) {
         if (isFunction (arg))
	    ex [arg.name] = arg;
         else
	    extend (ex, arg);
      });
   }

// Cannot use the util.* variant of these three functions since it
// would create a circular dependency

function extend (obj, ext)
{
   for (var prop in ext)
      if (ext.hasOwnProperty (prop))
         obj [prop] = ext [prop];
   return obj;
}

function toArray (obj)
{
   if (obj.toArray)
      return obj.toArray ();
   else
      return Array.prototype.slice.call (obj);
}

function isFunction (f)
{
   return typeof f === "function";
}

// Provide nicer logging of otherwise uncaught exceptions

process.on ("uncaughtException", function (evt) {
   var s = evt.toString ();
   if (s.indexOf ("Error:") != 0)
      s = "Error: " + s;
   console.error (s);
   if (evt.stack && s != evt.stack)
      console.error (evt.stack);
   process.exit (1);
});

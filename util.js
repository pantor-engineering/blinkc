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

require ("./extensions"); // Make sure we get module.provide
var fs = require ("fs");

// Public interface

module.provide (

   // Returns true if arg is a string

   isString, // (val)

   // Returns true if arg is a number

   isNumber, // (val)

   // Returns true if arg is a funtion object

   isFunction, // (val)
   
   // Returns true if the arg is an array

   isArray, // (val)

   // Returns true if arg is an enum symbol

   isEnum, // (val)

   // Copies all properties from the second arg to the first
   // arg, returns the first arg

   extend, // (obj, ext)

   // Returns a shallow clone of the specified object

   clone, // (obj)

   // Returns an array with all the names of the properties in obj
   
   getPropertyArray, // (obj)

   // Turns the arg into a real array. Use with built-in arguments for
   // example: 
   //    var argsAsArray = toArray (arguments);

   toArray, // (val)

   // Flattens one or more arrays. Items in subarrays are recurisvely
   // added to the flat result array.

   flatten, // (array ...)

   // Flattens an arguments array. Items in subarrays are recurisvely
   // added to the flat result array. If begin is specified, then begin
   // and end will be used to create a slice of the initial arguments
   // list before flattening

   flattenArgs, // (arguments [, begin [, end]])

   // Returns true if the arg is defined

   isDefined, // (val)

   // Returns true if the arg is undefined

   isUndefined, // (val)

   // Parses the command line (process.argv) as specified by the
   // supplied command line specification. Returns a command line
   // object where you can lookup the parameters by name:
   //
   //   var foo = cl.get ("foo");
   //   var bar = cl.getList ("bar");

   parseCmdLine, // (spec [, props])
   
   // Returns an enum object that contains properties that corresponds
   // to a list of symbols. The list of symbols is created by
   // flattening the arguments array. Each symbol is either a string
   // or an object. If it is a string, the enum property will be
   // assigned a positional integer. If it is an object, the
   // properties of the object will be copied to the enum object.
   //
   // The resulting enum object will also have a method, toSymbol for
   // converting from a value back to the corresponding symbol string
   // if possible.

   toEnum, // (sym ...)

   // Returns true if the second string is a prefix of the first
   // string

   startsWith, // (s, prefix)

   // Returns true if the second string is a suffix of the first
   // string

   endsWith, // (s, suffix)

   // Returns a string with len spaces

   spaces, // (len)

   // Returns the string s possibly padded with spaces at the
   // end to become len chars long

   fill, // (s, len)

   // Removes leading and trailing whitespace. Replaces internal
   // sequences of whitespace with single spaces

   normalizeSpace,

   // Returns an object that as properties has the functions passed as
   // arguments. The name of each property will be the same as the
   // name of the function

   toInterface, // (fn ...)

   // Sets the functions fn ... as methods to obj. Returns obj.

   setInterface, // (obj, fn ...)

   // Appends items from all arguments but the first into the first
   // array, updating

   append, // (result, array ...)

   // Returns true if the string s1 contains s2

   contains, // (s1, s2)

   // Returns the argument string with the first char capitalized
   
   capitalize, // (s)

   // Returns the argument string with the first char translated to
   // lower case
   
   decapitalize, // (s)
   
   // Returns the argument string with each letter following a 
   // character that is not a letter translated into upper case.
   
   toCamelCase, // (s)

   // Returns a new array where any duplicates in the argument array
   // has been removed
   
   unique, // (array)
   
   // Recursively creates directories 
   
   mkdir, // (dir)

   // Returns the first argument string s repeated n times
   
   repeat
);

function isString (s)
{
   return typeof s === "string" || s instanceof String;
}

function isNumber (n)
{
   return typeof n === "number";
}

function isFunction (f)
{
   return typeof f === "function";
}

function extend (obj, ext)
{
   for (var prop in ext)
      if (ext.hasOwnProperty (prop))
         obj [prop] = ext [prop];
   return obj;
}

function clone (obj)
{
   return extend (new obj.constructor (), obj);
}

function isDefined (val)
{
   return typeof val !== "undefined";
}

function isUndefined (val)
{
   return typeof val === "undefined";
}

function isArray (val)
{
   return Array.isArray (val)
}

function toArray (obj)
{
   if (obj.toArray)
      return obj.toArray ();
   else
      return Array.prototype.slice.call (obj);
}

function flatten ()
{
   var result = [];
   function inner (a)
   {
      a.forEach (function (i) {
	 if (Array.isArray (i))
	    inner (i)
	 else
	    result.push (i);
      });
   }
   inner (toArray (arguments));
   return result;
}

function flattenArgs (a, begin, end)
{
   if (isDefined (begin))
      return flatten (toArray (a).slice (begin, end));
   else
      return flatten (toArray (a));
}

function toInterface ()
{
   var iface = { };
   toArray (arguments).forEach (function (arg) {
      if (isFunction (arg))
	 iface [arg.name] = arg;
      else
	 extend (iface, arg);
   });
   return iface;
}

function setInterface (obj)
{
   return extend (obj, toInterface.apply (this, flattenArgs (arguments, 1)));
}

function parseCmdLine (spec, props)
{
   return require ("./cmdline").parse (spec, props);
}

function isEnum (v)
{
   return v instanceof Enum;
}

function Enum (sym, val)
{
   if (isString (sym))
   {
      this.sym = sym;
      this.val = val;
   }
   else
   {
      for (var i in sym)
      {
         this.sym = i;
         this.val = sym [i];
      }
   }
}

extend (Enum.prototype, {
   toString: function () { return this.sym; },
   lt: function (o) { return this.val < o.val; },
   lte: function (o) { return this.val <= o.val; },
   gt: function (o) { return this.val > o.val; },
   gte: function (o) { return this.val >= o.val; }
});

function toEnum ()
{
   var symByVal = { }

   // Use an ad-hoc constructor to stash the byValue away in the
   // prototype so that it doesn't become part of the own properties
   // of the enum.

   function localCtor () { }

   localCtor.prototype.byValue = function (v) { return symByVal [v]; }

   var enm = new localCtor ();
   var val = 0;
   var syms = flattenArgs (arguments);
   syms.forEach (function (s) { 
      var e = new Enum (s, val);
      enm [s] = e;
      symByVal [e.val] = e;
      if (isNumber (e.val))
         val = e.val + 1;
   });
   return enm;
}

function startsWith (s, what)
{
   return s.slice (0, what.length) == what;
}

function endsWith (s, what)
{
   return s.slice (-what.length) == what;
}

function append (result /* array ... */)
{
   for (var i = 1, len = arguments.length; i < len; ++ i)
      result.push.apply (result, arguments [i]);
}

function getPropertyArray (obj)
{
   return isDefined (obj) ? Object.keys (obj) : [];
}

function normalizeSpace (s)
{
   return s.replace (/^\s*|\s*$/g, "").replace (/\s+/g, " ");
}

function spaces (len)
{
   return Array (len + 1).join (' ');
}

function fill (s, len)
{
   var pad = len - s.length;
   if (pad > 0)
      return s + spaces (pad);
   else
      return s;
}

function capitalize (s)
{
   s = (s || "") + "";
   if (s)
      return s.charAt (0).toUpperCase () + s.slice (1);
   else
      return s;
}

function decapitalize (s)
{
   s = (s || "") + "";
   if (s)
      return s.charAt (0).toLowerCase () + s.slice (1);
   else
      return s;
}

function toCamelCase (s)
{
   s = (s || "") + "";
   return s.split (/([^a-zA-Z]+)/).map (function (t) { 
      return capitalize (t); 
   }).join ("");
}

function contains (s1, s2)
{
   return s1.indexOf (s2) != -1;
}

function unique (a)
{
   var u = { }
   return a.filter (function (i) { return !u [i] && (u [i] = true); });
}

function mkdir (d)
{
   var steps = d.split ('/');
   var p = "";
   steps.forEach (function (step) {
      p += step + '/';
      if (! fs.existsSync (p))
         fs.mkdirSync (p);
   });
}

function repeat (s, n)
{
   return new Array (n + 1).join (s);
}

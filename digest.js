// Copyright (c) 2014, Pantor Engineering AB
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

var util = require ("./util");
var scm = require ("./schema");
var crypto = require ("crypto");

module.provide (

   // Returns the SHA-1 hash of the type signature for the specified
   // group or type definition. The hash is returned as a hex string

   getHash, // (groupOrDefine, schema)

   // Returns the type signature string for the specified group or
   // type definition

   getSignature // (groupOrDefine, schema)
);

var TypeToken = [
   'c' /* I8 */, 'C' /* U8 */, 's' /* I16 */, 'S' /* U16 */, 'i' /* I32 */,
   'I' /* U32 */, 'l' /* I64 */, 'L' /* U64 */, 'f' /* F64 */, 'd' /* Dec */,
   'F' /* FixedDec */, 'D' /* Date */, 'm' /* TimeOfDayMilli */, 
   'n' /* TimeOfDayNano */, 'N' /* Nano */, 'M' /* Milli */, 'B' /* Bool */, 
   'O' /* Obj */, 'U' /* Str */, 'V' /* Bin */, 'X' /* Fixed */
];

var RefToken = 'R';
var DynRefToken = 'Y';
var EnumToken = 'E';

function getSignature (def, schema)
{
   var sig;

   function getDefHash (d)
   {
      if (d)
      {
         if (util.isUndefined (d.hash))
         {
            d.hash = 0; // Prevent accidental infinite loops
            d.hash = getHash (d, schema);
         }

         return d.hash;
      }
   }

   function addType (t)
   {
      if (t.isEnum ())
         sig.push (EnumToken);
      else if (t.isRef ())
      {
         var d = schema.find (t.name, t.ns);
         if (t.isDynamic ())
            sig.push (DynRefToken, d.qname);
         else
            sig.push (RefToken, getDefHash (d))
         sig.push (';');
      }
      else
      {
         sig.push (TypeToken [t.code.val]);
         switch (t.code)
         {
         case scm.TypeCode.String: case scm.TypeCode.Binary:
            if (t.maxSize)
               sig.push (t.maxSize);
            break;
         case scm.TypeCode.Fixed:
            sig.push (t.size);
            break;
         case scm.TypeCode.FixedDec:
            sig.push (t.scale);
            break;
         }
      }

      if (t.isSequence ())
         sig.push ('*');
   }

   function addField (f)
   {
      addType (f.type);
      sig.push (f.name);
      sig.push (f.isOptional () ? '?' : '!');
   }

   if (def instanceof scm.Group)
   {
      sig = [def.qname, '>'];

      if (def.super_)
         sig.push (getDefHash (schema.find (def.super_)));
      
      sig.push ('>');
      
      def.fields.forEach (addField);
   }
   else
   {
      sig = [def.qname, '='];
      addType (def.type);
   }

   return sig.join ('');
}

function getHash (def, schema)
{
   var sig = getSignature (def, schema);
   var fullHash = crypto.createHash ("sha1").update (sig).digest ("hex");
   return fullHash.slice (0, 16);
}

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

module.provide (
   create // (schema)
);

function create (s)
{
   var defaultNs = "";
   var curDef;
   var pendType;
   var pendLoc;
   var nextEnumVal;

   function onNsDecl (ns)
   {
      defaultNs = ns;
   }

   function onStartGroupDef (name, id, super_, annots, loc)
   {
      curDef = s.addGroup (name, id, super_, defaultNs, annots, loc);
   }

   function onStartDefine (name, id, annots, loc)
   {
      curDef = s.addDefine (name, id, defaultNs, annots, loc);
   }

   function onEndDefine () 
   { 
      curDef.setType (pendType);
   }

   function onStartField (loc) 
   { 
      pendLoc = loc; 
   }

   function onEndField (name, id, pres, annots)
   {
      curDef.addField (name, id, pendType, pres, annots, pendLoc);
   }

   function onTypeRef (name, layout, rank, annots, loc)
   {
      pendType = new schema.Ref (name, defaultNs, layout, rank, annots, loc);
   }

   function onStringType (rank, maxSize, annots, loc)
   {
      pendType = new schema.Type (schema.TypeCode.String, rank, annots, loc);
      if (maxSize)
	 pendType.maxSize = maxSize;
   }

   function onBinaryType (rank, maxSize, annots, loc)
   {
      pendType = new schema.Type (schema.TypeCode.Binary, rank, annots, loc);
      if (maxSize)
	 pendType.maxSize = maxSize;
   }

   function onFixedType (rank, size, annots, loc)
   {
      pendType = new schema.Type (schema.TypeCode.Fixed, rank, annots, loc);
      pendType.size = size;
   }

   function onPrimType (type, rank, annots, loc)
   {
      pendType = new schema.Type (type, rank, annots, loc);
   }

   function onStartEnum (loc)
   {
      pendType = new schema.Enum (loc);
      nextEnumVal = 0;
   }

   function onEnumSym (name, val, annots, loc)
   {
      val = val || nextEnumVal;
      nextEnumVal = val*1 + 1;
      pendType.addSymbol (name, val, annots, loc);
   }

   function onSchemaAnnot (annots, loc)
   {
      s.addAnnotations (annots, defaultNs);
   }

   function onIncrAnnot (name, substep, pathType, id, annots, loc)
   {
      s.addIncrAnnot (name, defaultNs, substep, pathType, id, annots, loc);
   }

   return util.toInterface (
      onNsDecl, onStartGroupDef, onStartField, onEndField, onStartDefine,
      onEndDefine, onStartEnum, onTypeRef, onStringType, onBinaryType, 
      onFixedType, onPrimType, onEnumSym, onSchemaAnnot, onIncrAnnot
   );
}

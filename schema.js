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
var ndu = require ("util");

var Presence = util.toEnum (
   "Optional", "Required"
);

var Layout = util.toEnum (
   "Dynamic", "Static"
);

var Rank = util.toEnum (
   "Single", "Sequence"
);

var PathType = util.toEnum (
   "Name", "Type"
);

var TypeCode = util.toEnum (
   "I8", "U8", "I16", "U16", "I32", "U32", "I64", "U64", "F64", "Decimal",
   "Date", "TimeOfDayMilli", "TimeOfDayNano", "Nanotime", "Millitime", 
   "Bool", "Object", "String"
);

module.provide (

   // Creates an schema, and read definitions from any specified schema files
   // Any arrays in the argument list will be flattened before processing

   create, // ([file ...])

   // The Schema constructor
   
   Schema, // ()

   // Type constructor, creates a type specifier
   
   Type, // (code, rank, annots, loc)

   // Ref constructor, creates a type reference specifier

   Ref, // (name, layout, rank, annots, loc);

   // Enum constructor, creates a enum type specifier

   Enum, // (rank, annots, loc);

   // Location constructor, creates a location to be used in error reporting

   Location,

   // Enum with types used in he onPrimType event
   
   { TypeCode: TypeCode },

   // Enum indicating optionality 

   { Presence: Presence },

   // Enum indicating if a reference is static or dynamic

   { Layout: Layout }, 
   
   // Enum indicating the rank of a field type

   { Rank: Rank },

   // Enum indicating if the target of an incremental annotation is a type 
   // or not

   { PathType: PathType },

   // Schema Exception 
   
   { Exception: SchemaException }
);

var rd = require ("./schema-reader.js"); // Must appear here

function create ()
{
   var s = new Schema ();
   s.read.call (s, util.toArray (arguments));
   return s;
}

function Schema ()
{
   this.grpMap = { };
   this.defMap = { };
   this.groups = [ ];
   this.defines = [ ];
   this.annotsPerNs = { };
   this.annots = { };
   this.pendIncrAnnots = [ ];
}

function error (msg, comp)
{
   return new SchemaException (msg, comp.loc || comp);
}

function makeQName (name, ns)
{
   if (ns)
      return ns + ":" + name;
   else
      return name;
}

util.extend (Schema.prototype, {
   read: function (/* file... */) {
      var self = this;
      util.flattenArgs (arguments).forEach (function (f) { 
         rd.read (f, self); 
      });
   },
   
   readFromString: function (s, fileName) {
      rd.readFromString (s, this, fileName);
   },

   isUniqueDef: function (name) {
      return ! (this.grpMap [name] || this.defMap [name]);
   },

   addGroup: function (name, id, super_, ns, annots, loc) {
      var qname = makeQName (name, ns);
      if (this.isUniqueDef (qname))
      {
         return this.grpMap [qname] = 
            new Group (name, qname, id, super_, ns, annots, loc);
      }
      else
         throw this.duplicateErr ("group", qname, loc);
   },
   
   getGroup: function (name) { return grpMap [name]; },

   addDefine: function (name, id, ns, annots, loc) {
      var qname = makeQName (name, ns);
      if (this.isUniqueDef (qname))
      {
         return this.defMap [qname] = 
            new Define (name, qname, id, ns, annots, loc);
      }
      else
         throw this.duplicateErr ("type", qname, loc);
   },
   
   getDefine: function (name) { return defMap [name]; },

   duplicateErr: function (kind, name, loc) {
      var prev = this.grpMap [name] || this.defMap [name];
      var prevKind = (prev instanceof Group) ? "group" : "type";
      var msg = "Conflicting blink " + kind + " definition: " + name +
         "\n  Previously defined as " + prevKind + " here: " + prev.loc;
      return error (msg, loc);
   },
   
   addAnnotations: function (annots, ns) {
      var domain = this.annotsPerNs [ns];
      if (! domain)
         this.annotsPerNs [ns] = domain = { };
      util.extend (domain, annots);
      util.extend (this.annots, annots);
   },

   getAnnotation: function (name, ns) {
      return this.getAnnotations (ns) [name];
   },

   getAnnotations: function (schemaNs) {
      if (schemaNs)
         return this.annotsPerNs [schemaNs] || { }
      else
         return this.annots;
   },

   addIncrAnnot: function (name, ns, substep, pathType, id, annots, loc) {
      this.pendIncrAnnots.push ({
         name: name, ns: ns, substep: substep, pathType: pathType, id: id,
         annots: annots || { }, loc: loc
      });
   },

   find: function (name, defaultNs) {
      var d = this.defMap [name] || this.grpMap [name];
      if (! d && defaultNs && ! isQname (name))
      {
         name = defaultNs + ":" + name;
         d = this.defMap [name] || this.grpMap [name];
      }
      return d;
   },

   getNamespaces: function () {
      return util.unique (this.allDefs.map (function (d) { return d.ns; }));
   },
   
   getDefines: function (ns) {
      if (ns)
         return this.definesByNs [ns] || [];
      else
         return this.defines;
   },

   getGroups: function (ns) {
      if (ns)
         return this.groupsByNs [ns] || [];
      else
         return this.groups;
   },
   
   resolveRef: resolveRef,
   dump: dumpSchema,
   finalize: finalizeSchema
});

function Group (name, qname, id, super_, ns, annots, loc)
{
   this.name = name;
   this.qname = qname;
   this.id = id;
   this.super_ = super_;
   this.annots = annots || { };
   this.ns = ns;
   this.loc = loc;
   this.fieldMap = { };
   this.fields = [ ];
   this.weight = 0;
}

util.extend (Group.prototype, {
   addField: function (name, id, type, pres, annots, loc) { 
      if (this.fieldMap [name])
         throw error ("Duplicate field name in " + this.qname + ": " + name, 
                      loc);
      var f = new Field (name, id, type, pres, annots, loc);
      this.fieldMap [name] = f;
      this.fields.push (f);
      return f;
   }
});

function Field (name, id, type, pres, annots, loc)
{
   this.name = name;
   this.id = id;
   this.type = type;
   this.pres = pres;
   this.annots = annots || { };
   this.loc = loc;
}

util.extend (Field.prototype, {
   isOptional: function () { return this.pres == Presence.Optional; }
});

function Define (name, qname, id, ns, annots, loc)
{
   this.name = name;
   this.qname = qname;
   this.id = id;
   this.annos = annots || { };
   this.ns = ns;
   this.loc = loc;
}

util.extend (Define.prototype, {
   setType: function (t) { this.type = t; }
});

function Type (code, rank, annots, loc)
{
   this.code = code;
   this.rank = rank;
   this.annots = annots || { };
   this.loc = loc;
}

util.extend (Type.prototype, {
   isSequence: function () { return this.rank == Rank.Sequence; },
   isEnum: function () { return false; },
   isRef: function () { return false; }
});

function Ref (name, ns, layout, rank, annots, loc)
{
   this.name = name;
   this.ns = ns;
   this.layout = layout || Layout.Static;
   this.rank = rank || Layout.Single;
   this.annots = annots || { };
   this.loc = loc || new Location ();
}

util.extend (Ref.prototype, {
   isDynamic: function () { return this.layout == Layout.Dynamic; },
   isSequence: function () { return this.rank == Rank.Sequence; },
   isEnum: function () { return false; },
   isRef: function () { return true; }
});

function Enum (loc)
{
   this.loc = loc;
   this.annots = { };
   this.symMap = { }
   this.symbols = [ ];
   this.symByVal = { }
}

util.extend (Enum.prototype, {
   addSymbol: function (name, val, annots, loc) {
      if (this.symMap [name])
         throw error ("Duplicate symbol name in enum: " + name, loc);

      if (this.symByVal [val])
         throw error ("Duplicate symbol value in enum: " + val, loc);
      
      var sym = { name: name, val: val, annots: annots || {}, loc: loc };
      this.symMap [name] = sym;
      this.symByVal [val] = sym;
      this.symbols.push (sym);
      return sym;
   },
   updateValue: function (sym, val) {
      delete symByVal [sym.val];
      if (symByVal [val])
	 throw error ("Duplicate symbol value in enum: " + val, sym);
      sym.val = val
      symByVal [val] = sym;
   },
   isSequence: function () { return false; },
   isEnum: function () { return true; },
   isRef: function () { return false; }
});

function SchemaException (msg, loc)
{
   if (util.isArray (msg))
      msg = ndu.format.apply (ndu, msg);
   this.msg = msg;
   this.loc = loc;
}

util.extend (SchemaException.prototype, {
   toString: function () { return this.loc + ": error: " + this.msg; }
});

function Location (line, col, src)
{
   this.line = line;
   this.col = col;
   this.src = src;
}

util.extend (Location.prototype, {
   toString: function () { 
      return ndu.format ("%s:%d:%d", this.src, this.line, this.col);
   }
});

function resolveRef (t, isSequence, isDynamic)
{
   if (t.isRef ())
   {
      isDynamic = isDynamic || t.isDynamic ();
      isSequence = isSequence || t.isSequence ();
      var d = this.find (t.name, t.ns);
      if (d instanceof Group)
         return { group: d, isSequence: isSequence, isDynamic: isDynamic }
      else if (d instanceof Define)
      {
         if (d.type.isEnum ())
            return { define: d, isSequence: isSequence }
         else
            return this.resolveRef (d.type, isSequence, isDynamic);
      }
      else
         return null;
   }
   else
      return { type: t, isSequence: isSequence }
}

function dumpSchema ()
{
   // FIXME: super, id, enum-val, annots ...

   function dumpDef (d)
   {
      console.log (d.qname + " = \n  " + fmtType (d.type) + "\n");
   }

   function dumpGrp (g)
   {
      console.log (g.qname + (g.fields.length ? " ->" : "") +
                   (g.super_ ? " : " + g.super_ : ""));
      g.fields.forEach (function (f, pos) {
         var comma = "";
         var pres = "";
         if (pos != g.fields.length - 1)
            comma = ",";
         if (f.isOptional ())
            pres = "?";
         console.log ("  " + fmtType (f.type) + " " + f.name + pres + comma);
      });
      console.log ();
   }

   function fmtType (t)
   {
      var spec = "";
      if (t.isEnum ())
      {
         if (t.symbols.length == 1)
            spec = "|" + t.symbols [0].name;
         else
            t.symbols.forEach (function (s, pos) {
               if (pos)
                  spec += " | ";
               spec += s.name;
            });
      }
      else if (t.isRef ())
      {
         spec = t.name;
         if (t.isDynamic ())
            spec += "*";
      }
      else if (t.code == TypeCode.String)
      {
         spec = "string";
         if (t.contentType)
            spec += " (" + t.contentType + ")";
      }
      else
         spec = util.decapitalize (t.code);
      
      if (t.isSequence ())
         spec += " []";

      return spec;
   }

   this.defines.forEach (dumpDef);
   this.groups.forEach (dumpGrp);
}

function finalizeSchema ()
{
   var self = this;

   self.groups = [ ];
   self.defines = [ ];

   self.pendIncrAnnots.forEach (applyIncrAnnot);
   self.pendIncrAnnots = [ ];

   checkAndResolve ();

   function applyIncrAnnot (a)
   {         
      var d = self.find (a.name, a.ns);

      if (d instanceof Define)
      {
         if (a.substep)
         {
            if (a.pathType == PathType.Type)
               throw error ("Cannot use a substep and the keyword 'type' " +
                            "together when referencing a type definition", a);
            
            if (d.type.isEnum ())
            {
               var sym = d.type.symMap [a.substep];
               if (sym)
               {
                  if (a.id)
                     d.type.updateValue (sym, a.id);
                  util.extend (sym.annots, a.annots);
               }
               else
                  throw error ("The enum " + a.name + " has no symbol named " +
                               a.substep, a);
            }
            else
               throw error ("Cannot use a substep reference on a type " +
                            "definition that is not an enum", a);
         }
         else if (a.pathType == PathType.Type)
	 {
	    if (d.type instanceof Enum)
	       throw error ("Cannot apply incremental annotations to " +
			    "an enum type as a whole", a);
            util.extend (d.type.annots, a.annots);
	 }
         else
         {
            if (a.id)
               d.id = a.id;
            util.extend (d.annots, a.annots);
         }
      }
      else if (d instanceof Group)
      {
         if (a.substep)
         {
            var f = d.fieldMap [a.substep];
            if (f)
            {
               if (a.pathType == PathType.Type)
                  util.extend (f.type.annots, a.annots);
               else
               {
                  if (a.id)
                     f.id = a.id;
                  util.extend (f.annots, a.annots);
               }
            }
            else
               console.log (a.loc + ": warning: No such field in incremental" + 
                            " annotation: " + a.name + "." + a.substep);
         }
         else
         {
            if (a.pathType == PathType.Type)
               throw error ("Cannot use keyword 'type' directly on a group " +
                            "reference", a);
            if (a.id)
               d.id = a.id;
            util.extend (d.annots, a.annots);
         }
      }
      else
         console.log (a.loc + ": warning: No such group or define in " + 
                      "incremental annotation: " + a.name);
   }

   function checkAndResolve ()
   {
      util.getPropertyArray (self.defMap).forEach (function (n) {
         var d = self.defMap [n];
         resolveDefs (d);
         self.defines.push (d);
      });

      util.getPropertyArray (self.grpMap).forEach (function (n) {
         var g = self.grpMap [n];
         resolveGrps (g);
         self.groups.push (g);
      });

      self.groups.forEach (function (g) { checkInheritance (g); });

      self.defines.sort (cmpWeight);
      self.groups.sort (cmpWeight);
      self.allDefs = self.defines.concat (self.groups);

      self.definesByNs = { };
      self.defines.forEach (function (d) {
         var ns = self.definesByNs [d.ns];
         if (! ns)
            self.definesByNs [d.ns] = ns = [ ];
         ns.push (d);
      });

      self.groupsByNs = { };
      self.groups.forEach (function (g) {
         var ns = self.groupsByNs [g.ns];
         if (! ns)
            self.groupsByNs [g.ns] = ns = [ ];
         ns.push (g);
      });
   }

   function resolveDefs (d, referrer, isSequence)
   {
      referrer = referrer || d;

      if (d.visited)
         throw recursionError ("type", d.qname, referrer);

      if (isSequence && d.type.isSequence ())
         throw error ("The sequence item type " + d.qname +
                      " must not be a sequence in itself", referrer);
      
      d.visited = true;
      
      ++ d.weight;
      resolveDefsType (d.type, isSequence);

      d.visited = false;
   }

   function resolveDefsType (t, isSequence)
   {
      if (t.isRef ())
      {
         if (! resolveDefsRef (t, isSequence || t.isSequence ()))
            throw refError ("type", t.name, t.ns, t);
      }
   }

   function resolveDefsRef (t, isSequence)
   {
      var d = self.find (t.name, t.ns)
      if (d)
      {
         t.name = d.qname;
         if (d instanceof Define)
            resolveDefs (d, t, isSequence);
         return true;
      }
      else
         return false;
   }

   function resolveGrps (g, referrer)
   {
      referrer = referrer || g;
      
      if (g.visited)
         throw recursionError ("group", g.qname, referrer);

      g.visited = true;
      ++ g.weight;

      g.fields.forEach (function (f) { resolveGrpsType (f.type, f) ; });

      if (g.super_)
      {
         var superRef = { name: g.super_, ns: g.ns, loc: g.loc };
         if (! resolveGrpsRef (superRef))
            throw refError ("super", g.super_, g.ns, g);
         else
            g.super_ = superRef.name;
      }

      g.visited = false;
   }

   function resolveGrpsDef (d, referrer, f)
   {
      if (d.visited)
         throw recursionError ("type", d.qname, referrer);

      d.visited = true;
   
      ++ d.weight;
      resolveGrpsType (d.type, f);

      d.visited = false;
   }

   function resolveGrpsType (t, f)
   {
      if (f && t !== f.type && t.isSequence () && f.type.isSequence ())
         throw error ("The sequence item type of the field " + f.name +
                      " must not also be a sequence", f);
      
      if (t.isRef ())
      {
         if (t.layout == Layout.Dynamic)
         {
            t.name = resolveRefName (t.name, t.ns);
            if (! resolveGrp (t))
               throw error ("Dynamic reference to " + t.name +
                            " does not refer to a group definition", t);
         }
         else
         {
            if (! resolveGrpsRef (t, f))
               throw refError ("type", t.name, t.ns, t);
         }
      }
   }

   function resolveGrpsRef (t, f)
   {
      var d = self.find (t.name, t.ns)
      if (d)
      {
         t.name = d.qname;
         if (d instanceof Group)
            resolveGrps (d, t);
         else
            resolveGrpsDef (d, t, f);
         return true;
      }
      else
         return false;
   }

   function checkInheritance (g, unique)
   {
      unique = unique || { };

      if (g.super_)
      {
         if (! g.superGrp)
         {
            var info = resolveGrp (g.super_, g.ns);
            if (! info)
               throw error ("Supergroup reference to " + g.super_ +
                            " does not refer to a group definition", g);
            if (info.isDynamic)
               throw error ("Supergroup reference to " + g.super_ +
                            " must not be dynamic", g);
            if (info.isSequence)
               throw error ("Supergroup reference " + g.super_ +
                            " must not refer to a sequence", g);
            g.superGrp = info.group;
         }

         checkInheritance (g.superGrp, unique);
      }

      g.fields.forEach (function (f) {
         var shadows = unique [f.name];
         if (shadows)
            throw error ("The field " + g.qname + "." + f.name +
                         " shadows a field inherited from " + shadows.g.qname +
                         "\n  Defined here: " + shadows.f.loc, f);
         else
            unique [f.name] = { g: g, f: f };
      });
   }

   function resolveRefName (name, ns)
   {
      var d = self.find (name, ns);
      return d ? d.qname : "";
   }

   function resolveGrp (name, ns)
   {
      var ref = (name instanceof Ref) ? name : new Ref (name, ns);
      var result = self.resolveRef (ref);
      if (result.group)
         return result;
   }
}

function cmpWeight (d1, d2)
{
   return d2.weight - d1.weight;
}

function isQname (name)
{
   return util.contains (name, ':');
}

function recursionError (what, name, loc)
{
   return error ("Illegal recursive reference: the " + what + " definition " + 
                 name + " directly or indirectly refers to itself", loc);
}


function refError (what, name, ns, loc)
{
   var msg = "No such definition in " + what + " reference: " + name;

   if (! isQname (name) && ns)
      msg += " or " + ns + ":" + name;

   return error (msg, loc);
}

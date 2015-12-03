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

var util = require ("./util");
var cg = require ("./codegen");
var scm = require ("./schema");
var path = require ("path");

module.provide (start);

var cl;
var verbosity;

var Mode = util.toEnum ("PkgPerNs", "WrapperPerNs", "SingleWrapper");

function start (baseCl, load)
{
   cl = util.parseCmdLine ([
      baseCl.getSpec (),
      "  [-p/--package <pkg>]             # Java package for generated files",
      "  [-n/--wrapper-per-ns]            # Creates a wrapper for each ",
      "                                   # namespace",
      "  [-w/--wrapper <class>]           # Wrapper class name",
      "  [-e/--extends <class>]           # Group superclass",
      "  [-d/--print-output-files]        # Print list of files that would be created",
      "                                   # suitable for dependency generation."
   ]);

   verbosity = cl.count ("verbose");
   load (cl.getList ("schema"), transform);
}

function transform (schema)
{
   // Classes are generated in one of three ways. If the -w/--wrapper
   // parameter is specified, all classes are put as inner classes to
   // the specified wrapper calls. If the -n/--wrapper-per-ns option
   // is specified, then one wrapper is created for each unique
   // namespace. If neither -w nor -n is specified, then one package
   // is created for each unique namespace.
   
   // In all the three variants it's possible to specify a base
   // package to use. If the method selected produces wrapper classes,
   // then these wrapper classes ar put in the specified package. If
   // the default method is used, then the namespace specific package
   // becomes a subpackage to the base package.
   
   // The base package can be specified in the following ways, with
   // decreasing precedence:

   //  1: Explicitly through the -p/--package option
   //  2: The schema annotation @java:package in the wrapper namespace
   //  3: The schema annotation @package in the wrapper namespace
   //  4: The schema annotation @java:package in any wrapper namespace
   //  5: The schema annotation @package in any wrapper namespace

   var dir = cl.get ("output") || ".";

   var base = cl.get ("extends");

   var printOutput = cl.has ("print-output-files");
   var outputFiles = {}

   if (cl.has ("wrapper"))
   {
      var w = cl.get ("wrapper");
      var defs = schema.getDefines ();
      var grps = schema.getGroups ();
      var pkg = getPackage (w, schema);
      var f = createWrapperFile (schema, w, '', pkg, base, defs, grps, dir,
                                 Mode.SingleWrapper);
      if (printOutput)
         outputFiles [f] = true;
   }
   else if (cl.has ("wrapper-per-ns"))
   {
      var namespaces = schema.getNamespaces ();
      if (verbosity > 0)
         console.log ("Wrappers: '" +  namespaces.join ("', '") + "'");

      namespaces.forEach (function (ns) {
         var defs = schema.getDefines (ns);
         var grps = schema.getGroups (ns);
         var pkg = getPackage (ns, schema);
         var w = ns || cl.get ("wrapper") || getEmptyNsWrapper (namespaces);
         var f = createWrapperFile (schema, w, ns, pkg, base, defs, grps, dir,
                                    Mode.WrapperPerNs);
         if (printOutput)
            outputFiles [f] = true;
      });
   }
   else // One subpackage per ns
   {
      var namespaces = schema.getNamespaces ();
      if (verbosity > 0)
         console.log ("Packages: '" +  namespaces.join (", '") + "'");

      namespaces.forEach (function (ns) { 
         var defs = schema.getDefines (ns);
         var grps = schema.getGroups (ns);
         var pkg = getPackage (ns, schema);
         if (pkg && ns)
            pkg = pkg + "." + splitCamelbackLower (ns);
         else
         {
            if (ns)
               pkg = splitCamelbackLower (ns);
         }

         // Enums

         defs.forEach (function (d) {
            if (d.type.isEnum ())
            {
               var f = createEnumFile (d, schema, pkg, dir);
               if (printOutput)
                  outputFiles [f] = true;
            }
         });

         // Classes for groups

         grps.forEach (function (g) {
            var f = createClassFile (g, ns, schema, pkg, base, dir);
            if (printOutput)
               outputFiles [f] = true;
         });

      });
   }

   if (printOutput)
   {
      var out = [];
      for (var f in outputFiles)
         if (util.isDefined (f))
            out.push (f);

      console.log (out.join (' '));
   }
}

function getEmptyNsWrapper (namespaces)
{
   var candidate = "Default";
   while (namespaces.indexOf (candidate) >= 0)
      candidate = candidate + "_";
   return candidate;
}

function createWrapperFile (schema, wrapper, ns, pkg, base, defs, grps, dir, 
                            mode)
{
   var ent = cg.entity ();

   ent.comment ("Generated by blinkc.js");
   ent.ln ();

   if (pkg)
      ent.ln ("package %s;", pkg).ln ();

   var wcl = ent.block ("public final class %s", escName (wrapper));

   // Enums

   defs.forEach (function (d) {
      if (d.type.isEnum ())
         createEnum (d, wcl, "static", wrapper);
   });

   // Classes for groups

   grps.forEach (function (g) { 
      createGroupClass (g, ns, schema, wcl, base, mode, wrapper, "static"); 
   });

   // Write result to file

   return cg.renderJava (ent, wrapper, pkg, dir, verbosity);
}

function createClassFile (g, ns, schema, pkg, base, dir)
{
   var ent = cg.entity ();

   ent.comment ("Generated by blinkc.js");
   ent.ln ();

   if (pkg)
      ent.ln ("package %s;", pkg).ln ();

   createGroupClass (g, ns, schema, ent, base, Mode.PkgPerNs);
   return cg.renderJava (ent, escName (g.name), pkg, dir, verbosity);
}

function createEnumFile (d, schema, pkg, dir)
{
   var ent = cg.entity ();

   ent.comment ("Generated by blinkc.js");
   ent.ln ();

   if (pkg)
      ent.ln ("package %s;", pkg).ln ();

   createEnum (d, ent);
   return cg.renderJava (ent, escName (d.name), pkg, dir, verbosity);
}

function createGroupClass (g, ns, schema, ent, base, mode, wrapper, modifier)
{
   var ext = "";
   if (g.superGrp)
      ext = " extends " + qualified (g.superGrp, ns, schema, mode, wrapper);
   else
   {
      if (base)
         ext = " extends " + base;
   }

   var cl = ent.block ("public %sclass %s%s", modifier ? modifier + " " : "",
		       escName (g.name, wrapper), ext);
   ent.ln ();
   
   // Getters and setters

   g.fields.forEach (function (f) {
      var t = getFieldType (f.type, schema, ns, mode, wrapper);
      var mtodName = escMethodName (f.name);
      cl.ln ("public %s get%s () { return m_%s; }", t, mtodName, f.name);

      if (f.isOptional ())
      {
         if (usesPodType (f.type, schema))
         {
            cl.ln ("public boolean has%s () { return has_%s; }", mtodName,
                   f.name);
            cl.ln ("public void clear%s () { has_%s = false; }", mtodName,
                   f.name);
            cl.ln ("public void set%s (%s v) { m_%s = v; has_%s = true; }", 
                   mtodName, t, f.name, f.name);
         }
         else
         {
            cl.ln ("public boolean has%s () { return m_%s != null; }",
                   mtodName, f.name);
            cl.ln ("public void clear%s () { m_%s = null; }", mtodName,
                   f.name);
            cl.ln ("public void set%s (%s v) { m_%s = v; }", mtodName, t, 
                   f.name);
         }
      }
      else
         cl.ln ("public void set%s (%s v) { m_%s = v; }", mtodName, t, f.name);
   });
   
   cl.ln ();

   // Presence flags

   var hasFlag;
   g.fields.forEach (function (f) {
      if (f.isOptional () && usesPodType (f.type, schema))
      {
         hasFlag = true;
         cl.ln ("private boolean has_%s;", f.name);
      }
   });

   if (hasFlag)
      cl.ln ();

   // Members

   g.fields.forEach (function (f) {
      var t = getFieldType (f.type, schema, ns, mode, wrapper);
      cl.ln ("private %s m_%s;", t, f.name);
   });
}

function createEnum (d, ent, modifier, wrapper)
{
   var enm = ent.block ("public %senum %s", modifier ? modifier + " " : "",
		        escName (d.name, wrapper));
   var syms = d.type.symbols;
   syms.forEach (function (sym, pos) {
      var sep = pos < syms.length - 1 ? ',' : ';';
      enm.ln ("%s (%d)%s", escName (sym.name), sym.val, sep);
   });

   enm.ln ();
   enm.ln ("private %s (int val) { this.val = val; }", 
           escName (d.name, wrapper));
   enm.ln ("public int getValue () { return val; }");
   enm.ln ("private final int val;");

   ent.ln ();
}

function qualified (d, ns, schema, mode, wrapper)
{
   if (mode == Mode.SingleWrapper || d.ns == ns)
      return escName (d.name, wrapper);
   else if (mode == Mode.PkgPerNs)
   {
      var pkg = getPackage (d.ns, schema);
      var nsPkg = d.ns ? (splitCamelbackLower (d.ns) + ".") : "";
      return (pkg ? pkg + "." : "") + nsPkg + escName (d.name);
   }
   else
   {
      var pkg = getPackage (d.ns, schema);
      return (pkg ? pkg + "." : "") + escName (wrapper) + "." + 
         escName (d.name, wrapper);
   }
}

function getFieldType (t, schema, ns, mode, wrapper)
{
   if (t.isRef ())
   {
      var r = schema.resolveRef (t);
      var jt;
      if (r.group)
         jt = qualified (r.group, ns, schema, mode, wrapper);
      else if (r.define)
         jt = qualified (r.define, ns, schema, mode, wrapper);
      else
         jt = mapTypeCode (r.type.code);
      return jt + (r.isSequence ? " []" : "");
   }
   else
      return mapTypeCode (t.code) + (t.isSequence () ? " []" : "");
}

function getPackage (ns, schema)
{
   return cl.get ("package") || 
      schema.getAnnotation ("java:package", ns) ||
      schema.getAnnotation ("package", ns) ||
      schema.getAnnotation ("java:package") ||
      schema.getAnnotation ("package");
}

function usesPodType (t, schema)
{
   if (t.isSequence ())
      return false;
   else if (t.isRef ())
   {
      var r = schema.resolveRef (t);
      if (r.type)
         return usesPodType (r.type)
      else
         return false;
   }
   else
   {
      switch (t.code)
      {
      case scm.TypeCode.Decimal: case scm.TypeCode.Object: 
      case scm.TypeCode.String: case scm.TypeCode.Binary: 
      case scm.TypeCode.Fixed:
         return false;
      default:
         return true;
      }
   }
}

function mapTypeCode (code)
{
   switch (code)
   {
   case scm.TypeCode.I8: case scm.TypeCode.U8: return "byte";
   case scm.TypeCode.I16: case scm.TypeCode.U16: return "short";
   case scm.TypeCode.I32: case scm.TypeCode.U32: return "int";
   case scm.TypeCode.I64: case scm.TypeCode.U64: return "long";
   case scm.TypeCode.F64: return "double";
   case scm.TypeCode.Decimal: return "com.pantor.blink.Decimal";
   case scm.TypeCode.FixedDec: return "long";
   case scm.TypeCode.Date: return "int";
   case scm.TypeCode.TimeOfDayMilli: return "int";
   case scm.TypeCode.TimeOfDayNano: return "long";
   case scm.TypeCode.Nanotime: return "long";
   case scm.TypeCode.Millitime: return "long";
   case scm.TypeCode.Bool: return "boolean";
   case scm.TypeCode.Object: return "java.lang.Object";
   case scm.TypeCode.String: return "java.lang.String";
   case scm.TypeCode.Binary: return "byte []";
   case scm.TypeCode.Fixed: return "byte []";
   }
}

var JavaKeyword = { };

[ 
   "abstract", "continue", "for", "new", "switch", "assert", "default", 
   "goto", "package", "synchronized", "boolean", "do", "if", "private", 
   "this", "break", "double", "implements", "protected", "throw", "byte", 
   "else", "import", "public", "throws", "case", "enum", "instanceof", 
   "return", "transient", "catch", "extends", "int", "short", "try", "char", 
   "final", "interface", "static", "void", "class", "finally", "long", 
   "strictfp", "volatile", "const", "float", "native", "super", "while", 
   "true", "false", "null" 
].forEach (function (w) { JavaKeyword [w] = true; });

function escName (n, wrapper)
{
   if (util.endsWith (n, "_") || JavaKeyword [n])
   {
      if (n === wrapper)
         return n + "__";
      else
         return n + "_";
   }
   else
   {
      if (n === wrapper)
         return n + "_";
      else
         return n;
   }
}

function escMethodName (n)
{
   if (util.endsWith (n, "_") || n == "Class")
      return n + "_";
   else
      return n;
}

function splitCamelbackLower (s)
{
   return escName (s.replace (/([a-z])(?=[A-Z])/g, "$1_").toLowerCase ());
}

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
var sbuilder = require ("./schema-builder");
var fs = require ("fs");

module.provide (

   // Reads a blink schema from a file. The second argument is either
   // a schema object or an observer. If it is a schema, then the
   // reader will populate it with definitions from the file. If it is
   // an observer, the observer will receive events corresponding to
   // the definitions in the file. The reader singals events by 
   // calling the following function properties in the observer:

   //   onNsDecl        (name)
   //
   //   onStartGroupDef (name, id, super, annots, loc)
   //   onEndGroupDef   ()
   //
   //   onStartField    (loc)
   //   onEndField      (name, id, pres, annots)
   //
   //   onStartDefine   (name, id, annots, loc)
   //   onEndDefine     ()
   //
   //   onStartEnum     (loc)
   //   onEndEnum       ()
   //
   //   onTypeRef       (name, layout, rank, annots, loc)
   //   onStringType    (rank, maxSize, annots, loc)
   //   onBinaryType    (rank, maxSize, annots, loc)
   //   onFixedType     (rank, size, annots, loc)
   //   onPrimType      (type, rank, annots, loc)
   //   onEnumSym       (name, val, annots, loc)
   //
   //   onSchemaAnnot   (annots, loc)
   //   onIncrAnnot     (name, substep, pathType, id, annots, loc) 
   
   // Components that can have substructures are represented by matching
   // start and end events.

   // The event arguments:
   //
   //   name     - name string
   //   super    - super type string
   //   type     - schema.TypeCode.I8 | ... | schema.TypeCode.Object
   //   layout   - schema.Layout.Dynamic | schema.Layout.Static
   //   val      - enum symbol value string
   //   id       - id string
   //   rank     - schema.Rank.Single | schema.Rank.Sequence
   //   pres     - Presence.Optional | Presence.Required
   //   substep  - component reference substep string
   //   pathType - schema.PathType.Name or schema.PathType.Type
   //   annots   - is an object where each property corresponds to an annotation
   //   loc      - { line: 1, col: 1, src: "schema.blink" }
   //   maxSize  - string or binary max size
   //   size     - fixed size

   read, // (file, schemaOrObserver)

   // Reads a blink schema from a string. An optional filename can be specified
   // to be used in any error reporting. If the first argument is an array,
   // it will be flattened and all elements will be joined into a single string
   // separated by newlines

   readFromString // (data, schemaOrObserver [, fileName])
);

function read (f, s)
{
   innerRead (fs.readFileSync (f), f || "-", makeObs (s));
}

function readFromString (data, s, fileName)
{
   if (util.isArray (s))
      data = util.flatten (data).join ("\n");
   innerRead (data, fileName || "-", makeObs (s));
}

var Events = [
   "NsDecl", "StartGroupDef", "EndGroupDef", "StartField", "EndField",
   "StartDefine", "EndDefine", "StartEnum", "EndEnum", "TypeRef",
   "StringType", "BinaryType", "FixedType", "PrimType", "EnumSym", 
   "SchemaAnnot", "IncrAnnot"
];

function makeObs (obs)
{
   obs = obs || createDumpObs ();
   if (obs instanceof schema.Schema)
      obs = sbuilder.create (obs);

   // Add dummy event handlers for events not handled by the observer

   var withDefaults = { }
   Events.forEach (function (e) {
      var n = "on" + e;
      var m = obs [n];
      if (m)
         withDefaults [n] = function () { m.apply (obs, arguments); }
      else
         withDefaults [n] = function () {  }
   });

   return withDefaults;
}

function createDumpObs ()
{
   var obs = { };

   Events.forEach (function (e) {
      obs ["on" + e] = function () {
         var args = [];
         for (var i = 0; i < arguments.length; ++ i)
         {
            var a = arguments [i];
            if (util.isString (a))
               args.push ('"' + a + '"');
            else if (util.isNumber (a) || util.isEnum (a))
               args.push (a);
            else if (a instanceof schema.Location)
               args.push (a);
            else
            {
               var annots = util.getPropertyArray (a).map (function (nm) {
                  return nm + "=\"" + a [nm] + "\"";
               });
               args.push ("[" + annots.join (", ") + "]");
            }
         }
         console.log (e + " (" + args.join (", ") + ")");
      }
   });

   return obs;
}

var Token;
var Single = { };
var Keyword = { };

function innerRead (data, fileName, obs)
{
   var tok = tokenize (data, fileName);

   var annotations = { }
   var pendId = "";
   var pendName = "";

   // schema ::=
   //    defs
   //  | nsDecl defs

   // nsDecl ::=
   //    "namespace" name

   if (tok.next ("namespace"))
      nsDecl ();

   // defs ::=
   //    e
   //  | def defs

   while (! tok.match ("End"))
      def ();

   function consumeAnnots () 
   {
      var tmp = annotations;
      annotations = { }
      return tmp;
   }

   function consumeId ()
   {
      var id = pendId;
      pendId = "";
      return id;
   }

   // annot ::=
   //   "@" qNameOrKeyword "=" literal

   function annot ()
   {
      var name = tok.nextNameOrKeyword () || tok.expected ("annotation name");
      tok.require ("=");
      var val = tok.require ("String");
      for (;;)
      {
	 var cont = tok.next ("String");
	 if (cont) 
            val += cont;
         else
            break;
      }
      annotations [name] = val;
   }

   // annots ::=
   //    e
   //  | annot annots

   function annots ()
   {      
      while (tok.next ("@")) annot ();
   }

   // nsDecl ::=
   //    "namespace" name

   function nsDecl ()
   {
      obs.onNsDecl (tok.require ("Name", "namespace name"));
   }

   // nameWithId ::=
   //    name id

   function nameWithId (what)
   {
      pendName = tok.require ("Name", what);
      pendId = "";
      if (tok.next ("/")) 
      {
	 pendId = tok.next ("Uint", "Hex") || 
            tok.expected ("unsigned integer or hex number");
      }
   }

   // sequence ::=
   //    single "[" "]"

   function rank ()
   {
      if (tok.next ("[")) 
      {
	 tok.require ("]");
	 return schema.Rank.Sequence;
      }
      else
	 return schema.Rank.Single;
   }

   // ref ::=
   //    qName
   //  | qName "*"

   function ref ()
   {
      var name = tok.next ();
      var kind = tok.next ("*") ? schema.Layout.Dynamic : schema.Layout.Static;
      var r = rank ();
      obs.onTypeRef (name, kind, r, consumeAnnots (), tok.lastLoc ());
   }

   // string ::=
   //    "string"
   //  | "string" "(" uInt ")"

   function string ()
   {
      tok.next ();
      var maxSize;
      if (tok.next ("("))
      {
	 maxSize = tok.require ("Uint", "string max size");
	 tok.require (")");
      }
      var r = rank ();
      obs.onStringType (r, maxSize, consumeAnnots (), tok.lastLoc ())
   }

   // binary ::=
   //    "binary"
   //  | "binary" "(" uInt ")"

   function binary ()
   {
      tok.next ();
      var maxSize;
      if (tok.next ("("))
      {
	 maxSize = tok.require ("Uint", "binary max size");
	 tok.require (")");
      }
      var r = rank ();
      obs.onBinaryType (r, maxSize, consumeAnnots (), tok.lastLoc ())
   }

   // fixed ::=
   //  | "fixed" "(" uInt ")"

   function fixed ()
   {
      tok.next ();
      tok.require ("(");
      var size = tok.require ("Uint", "fixed max size");
      tok.require (")");
      var r = rank ();
      obs.onFixedType (r, size, consumeAnnots (), tok.lastLoc ())
   }

   // "i8" ... "object"
   
   function primType ()
   {
      var t = schema.TypeCode [util.capitalize (tok.next ())];
      var r = rank ();
      obs.onPrimType (t, r, consumeAnnots (), tok.lastLoc ())
   }
   
   // type ::=
   //    single | sequence
   //
   // single ::=
   //    ref | time | number | string | binary | fixed | "bool" | "object"

   function type ()
   {
      if (tok.match ("Name", "Qname")) 
	 ref ();
      else if (tok.match ("string"))
	 string ();
      else if (tok.match ("binary"))
	 binary ();
      else if (tok.match ("fixed"))
	 fixed ();
      else if (tok.match ("namespace", "schema", "type"))
	 tok.expected ("type specifier");
      else if (tok.matchAnyKeyword ())
	 primType ();
      else
	 tok.expected ("type specifier");
   }

   // field ::=
   //    annots type annots nameWithId opt
   //
   // opt ::=
   //    e | "?"
   
   function field ()
   {
      annots ();
      obs.onStartField (tok.loc ());
      type ();
      annots ();
      nameWithId ("field name");
      var pres = 
         tok.next ("?") ? schema.Presence.Optional : schema.Presence.Required;
      obs.onEndField (pendName, consumeId (), pres, consumeAnnots ());
   }

   // groupDef ::=
   //    nameWithId super body
   //
   // super ::=
   //    e
   //  | ":" qName
   //
   // body ::=
   //    e
   //  | "->" fields

   // fields ::=
   //    field
   //  | field "," fields

   function groupDef ()
   {
      var sup = "";
      if (tok.next (":")) 
	 sup = tok.next ("Name", "Qname") || tok.expected ("supertype name");
      
      obs.onStartGroupDef (pendName, consumeId (), sup, consumeAnnots (), 
                           tok.lastLoc ());

      if (tok.next ("->"))
      {
         for (;;)
         {
            field ();
            if (! tok.next (","))
               break;
         }
      }

      obs.onEndGroupDef ();
   }

   // sym ::=
   //    annots name val
   //
   // val ::=
   //    e
   //  | "/" (int | hexNum)

   function sym ()
   {
      annots ();
      var name = tok.require ("Name", "enum symbol name");
      var val = "";
      if (tok.next ("/")) 
      {
	 val = tok.next ("Uint", "Int", "Hex") || 
	    tok.expected ("integer or hex number")
      }
      obs.onEnumSym (name, val, consumeAnnots (), tok.lastLoc ());
   }

   // enum ::=
   //    "|" sym
   //  | sym "|" syms
   //
   // syms ::=
   //    sym
   //  | sym "|" syms

   function enumeration ()
   {
      obs.onStartEnum (tok.lastLoc ());
      if (tok.next ("|"))
	 sym ();
      else
      {
         for (;;)
         {
            sym ();
            if (! tok.next ("|"))
               break;
         }
      }

      obs.onEndEnum ()
   }

   // define ::=
   //    nameWithId "=" (enum | (annots type))

   function define ()
   {
      obs.onStartDefine (pendName, consumeId (), consumeAnnots (), 
                         tok.lastLoc ());
      annots ();
      if (tok.match ("|") || (tok.match ("Name") && tok.matchPend ("/", "|")))
	 enumeration ();
      else
	 type ();
      obs.onEndDefine ();
   }

   // incrAnnotList ::=
   //    incrAnnotItem
   //  | incrAnnotItem "<-" incrAnnotList

   function incrAnnotList ()
   {
      if (! tok.match ("<-"))
	 tok.expected ("'<-'");

      while (tok.next ("<-"))
      {
	 if (tok.next ("@"))
	    annot ();
	 else
         {
	    pendId = tok.next ("Int", "Uint", "Hex");
	    if (! pendId)
	       tok.expected ("incremental annotation, integer or hex number")
	 }
      }
   }

   // incrAnnot ::=
   //    compRef "<-" incrAnnotList
   //
   // compRef ::=
   //    "schema"
   //  | qName
   //  | qName "." "type"
   //  | qName "." name
   //  | qName "." name "." "type"

   function incrAnnot ()
   {
      var loc = tok.lastLoc ();
      if (util.getPropertyArray (annotations).length)
	 tok.err ("An incremental annotation clause cannot be preceded" +
		  " by annotations");
      
      if (pendId)
	 tok.err ("An incremental annotation clause cannot set an" +
		  " ID using the slash notation. Use '<- id' instead");

      if (tok.next ("schema")) 
      {
	 incrAnnotList ();
         consumeId ();
	 obs.onSchemaAnnot (consumeAnnots (), loc);
      }
      else
      {
	 var pathType = schema.PathType.Name;
	 var substep = "";
	 if (tok.next (".")) 
         {
	    if (tok.next ("type")) 
	       pathType = schema.PathType.Type;
	    else
            {
	       substep = tok.require ("Name", "field or symbol name");
	       if (tok.next (".")) 
               {
		  tok.require ("type");
		  pathType = schema.PathType.Type;
	       }
	    }
	 }

	 incrAnnotList ();
	 obs.onIncrAnnot (pendName, substep, pathType, consumeId (),
                          consumeAnnots (), loc);
      }
   }

   // def ::=
   //    annots define
   //  | annots groupDef
   //  | incrAnnot

   function def ()
   {
      annots ();

      if (tok.match ("Qname"))
      {
         pendName = tok.next ();
	 incrAnnot ();
      }
      else if (tok.match ("schema"))
	 incrAnnot ();
      else
      {
	 nameWithId ("group or type definition name, or an incremental " +
		     "annotation");
	 if (tok.match ("<-", "."))
	    incrAnnot ();
	 else if (tok.next ("="))
	    define ();
	 else
	    groupDef ();
      }
   }
}

setupTokens ();

var NonFalseEmptyStr = { toString: function () { return ""; } }

function tokenize (s, src)
{
   s = s.toString ();
   var line = 1;
   var col = 0;
   var lastLine = line;
   var lastCol = col;

   var take = 0;
   var end = s.length;
   var hasMore = take < end;

   var cur = { }
   var pend = { }

   function err (/* format, args... */) 
   {
      throw new schema.Exception (util.toArray (arguments), 
                                  new schema.Location (line, col, src));
   }

   function expected (what)
   {
      err ("Expected %s but got %s", what, Token [cur.type]);
   }

   function get ()
   {
      if (hasMore)
      {
	 var c = s.charAt (take ++);
	 if (c == '\n')
         {
            ++ line;
            col = 0;
         }

	 hasMore = take < end;
         ++ col;
	 return c
      }
   }

   function peek () { if (hasMore) return s.charAt (take); }
   function lookahead (c) { if (peek () == c) return get (); }

   function skipComment ()
   {
      while (hasMore)
         if (get () == '\n')
            return;
   }

   function isWs (c) { return /\s/.test (c); }
   function isDigit (c) { return /\d/.test (c); }
   function isHexDigit (c) { return /[0-9a-fA-F]/.test (c); }
   function isNameStartChar (c) { return /[a-zA-Z_]/.test (c); }
   function isNameChar (c) { return isNameStartChar (c) || isDigit (c); }

   function clearText () { pend.val = ""; }
   function setText (v) { pend.val = v; }
   function appendText (v) { pend.val += v; }

   function skipWsAndComments ()
   {
      for (;;)
      {
	 var c = peek ();
	 if (isWs (c))
	    get ();
	 else if (c == '#')
         {
	    get ();
	    skipComment ();
         }
	 else
	    return;
      }
   }

   function setToken (t)
   {
      pend.type = t;
      pend.line = line;
      pend.col = col;
   }

   function readUInt (first)
   {
      setText (first);
      while (isDigit (peek ())) appendText (get ());
      if (isNameStartChar (peek ()))
	 err ("A number must end in digits");
   }

   function readHex ()
   {
      setToken ("Hex");
      setText ("0x");
      while (isHexDigit (peek ())) appendText (get ());
      if (isNameStartChar (peek ()))
	 err ("A number must end in hex digits");
   }

   function readStr (q)
   {
      clearText ()
      for (;;)
      {
	 var c = get ();
	 if (! c)
	    err ("Literal not terminated at end of schema, expected %s", q);
	 else if (c == '\n')
	    err ("Multiline literals are not allowed");
	 else if (c != q)
	    appendText (c);
	 else
	    return;
      }
   }
   
   function requireNameStart (c, what)
   {
      if (! isNameStartChar (c))
      {
	 if (isWs (c))
	    err ("Missing %s", what);
	 else
	    err ("Character not allowed at start of %s: '%s'", what, c);
      }
   }

   function readNcName ()
   {
      while (isNameChar (peek ())) appendText (get ());
   }

   function readNameOrKeyword ()
   {
      readNcName ();
      if (peek () == ':')
      {
	 get ();
	 setToken ("Qname")
	 appendText (':')
	 if (hasMore)
	    requireNameStart (peek (), "name part in qualified name");
         else
            err ("Missing name part after colon at end of file");
	 readNcName ();
      }
      else
	 setToken (Keyword [pend.val] || "Name");
   }

   // Moves the pending token to the current token, and parses a new token
   // into the pending token

   function advance ()
   {
      lastLine = cur.line;
      lastCol = cur.col;

      // Swap tokens

      var tmp = cur;
      cur = pend;
      pend = tmp;

      if (cur.type == "End")
      {
         pend.type = cur.type;
         return;
      }

      skipWsAndComments ();
      
      var c = get ()
      if (c)
      {
	 setToken (Single [c]);
	 if (pend.type)
            return;

         switch (c)
         {
         case '-':
	    if (lookahead ('>'))
	       setToken ("->");
	    else
            {
	       if (isDigit (peek ()))
               {
		  setToken ("Int")
		  readUInt (c);
	       }
	       else
		  err ("Expected digit or '>' after '-'");
	    }
            break;

	 case '"': case '\'':
	    setToken ("String");
	    readStr (c);
            break;

	 case '<':
	    if (lookahead ('-'))
	       setToken ("<-");
	    else
	       err ("Expected dash after '<'");
            break;

	 case '\\':
	    clearText ();
	    setToken ("Name");
            if (hasMore)
	       requireNameStart (peek (), "name after backslash");
            else
	       err ("Missing name after backslash at end of schema");
	    readNcName ();
            break;

	 case '0':
	    if (lookahead ('x'))
	       readHex ();
	    else
            {
	       setToken ("Uint");
	       readUInt (c);
            }
            break;

         default:
	    if (isDigit (c))
            {
	       setToken ("Uint");
	       readUInt (c);
            }
	    else if (isNameStartChar (c))
            {
	       setText (c);
	       readNameOrKeyword ();
            }
	    else
	       err ("Character not allowed here: '%s'", c);
            break;
	 }
      }
      else
	 pend.type = "End"
   }

   // Tests if the current token matches any of the arguments

   function match (/* token... */)
   {
      for (var i = 0; i < arguments.length; ++ i)
         if (cur.type == arguments [i])
            return true;
      return false;
   }

   // Tests if the pending token matches any of the arguments

   function matchPend (/* token... */)
   {
      for (var i = 0; i < arguments.length; ++ i)
         if (pend.type == arguments [i])
            return true;
      return false;
   }

   // Advances to the next token if the current token matches any of
   // the arguments, or unconditionally if called with no arguments

   function next (/* token */)
   {
      if (! arguments.length || match.apply (this, arguments))
      {
	 var val = cur.val || NonFalseEmptyStr;
	 advance ();
	 return val;
      }
   }

   // Tests if the current token is a keyword

   function matchAnyKeyword () { return !!Keyword [cur.type]; }

   // Advances to the next token if the current token is a name or keyword

   function nextNameOrKeyword ()
   {
      if (match ("Name", "Qname") || matchAnyKeyword ())
      {
	 var val = cur.val || NonFalseEmptyStr;
	 advance ();
	 return val;
      }
   }

   // Advances to the next token if the current token matches t, otherwise
   // raises an error

   function require_ (t, what)
   {
      return next (t) || expected (what || Token [t]);
   }

   // Returns the location of the current token

   function loc () { return new schema.Location (cur.line, cur.col, src); }

   // Returns the location of the token that was replaced by the
   // current token

   function lastLoc () { return new schema.Location (lastLine, lastCol, src); }

   next (); // Init current token
   next (); // Init lookahead token

   return util.toInterface (
      match, matchPend, next, err, expected, matchAnyKeyword, 
      nextNameOrKeyword, loc, lastLoc, { require: require_ }
   );
}

function setupTokens ()
{
   Token = {
      Int: "integer", Uint: "unsigned integer", String: "string literal", 
      Hex: "hex number", Qname: "qualified name", 
      Name: "name", End: "end of schema", "->": "'->'", "<-": "'<-'"
   }

   var singles = ",.=/[]():?*|@";

   var keywords = 
      util.getPropertyArray (schema.TypeCode).map (util.decapitalize);

   util.append (keywords, [ "namespace", "type", "schema" ])

   singles.split ('').forEach (function (t) {
      Single [t] = t;
      Token [t] = "'" + t + "'";
   });

   keywords.forEach (function (kw) { 
      Keyword [kw] = kw; 
      Token [kw] = "keyword '" + kw + "'";
   })
}


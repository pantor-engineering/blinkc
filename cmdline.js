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

// Public interface

module.provide (
   
   // Parses the command line (process.argv) as specified by the
   // supplied command line specification. Returns a command line
   // object where you can lookup the parameters by name.
   // The specification is eiter a string or an array of strings.
   // If it is an array it will be joined with join ("  ") to
   // create the spec string.
   //
   //   var cl = cmdline.parse ([
   //     "myprog",
   //     "  [-f/--foo]",
   //     "  bar ...",
   //   ]);
   //
   //   var foo = cl.get ("foo");
   //   var bar = cl.getList ("bar");
   //
   // It the help flag is specified on the command line, the usage
   // message will be displayed on the console and the program will
   // exit. The [-h/--help] option is automatically added to the
   // specification if not specified explicitly
   
   parse // (spec [, props])
);

// A command line specification must match this grammar:
//
//    command-line  ::= program annot params
//    
//    program       ::= Id
//
//    params        ::= <empty>
//                    | annot-param params
//
//    annot-param   ::= param-pattern annot
//
//    param-pattern ::= param
//                    | param '...'
//                    | '[' flag-or-param ']'
//                    | '[' flag-or-param '...' ']'
//
//    flag-or-param ::= tag
//                    | param
//
//    param         ::= tag ValString
//                    | positional
//
//    tag           ::= short-tag
//                    | short-tag '/' long-tag
//                    | long-tag
//
//    short-tag     ::= '-' Id
//
//    long-tag      ::= '--' Id
//
//    positional    ::= Id
//
//    annot         ::= <empty>
//                    | AnnotString annot
//
//    Id            ::= IdChar (IdChar | '-')*
//    IdChar        ::= [^:][=./<# \n\t\r-]
//    ValString     ::= '<' [^>]* '>'
//    AnnotString   ::= '#' ' '* (AnnotChar | (' ' AnnotChar))*
//    AnnotChar     ::= [^ \n\t\r]

// --

function parse (spec, props)
{
   props = props || { };
   var parser = createParser (spec, props);
   var result = parseParams (parser, process.argv.slice (2));

   result.cl.getUsage = function () {
      getUsage (parser, props);
   }
   
   if (props.disableHelp)
   {
      if (result.report)
         throw getErrorReport (result, parser);
      else
         return result.cl;
   }
   else
   {
      if (printUsageOrValidate (result, parser, props))
         process.exit ();
      else
         return result.cl;
   }
}

var tok = util.toEnum (
   "End", "Id", "Ellipsis", "DblDash", "ValStr", "AnnotStr",
   "Lpar", "Rpar", "Dash", "Slash", "Eq"
);

var type = util.toEnum ("Flag", "Param", "Positional");

function isPositional (def)
{
   return def.type === type.Positional;
}

function isParam (def)
{
   return def.type === type.Param;
}

function isFlag (def)
{
   return def.type === type.Flag;
}

function createParser (spec, props)
{
   spec = util.isArray (spec) ? util.flatten (spec).join ("  ") : spec;

   var parser = { 
      defs: [], defByName: { }, positionals: [], props: props, spec: spec 
   };
   
   var take = 0;
   var end = spec.length;
   var tokenStart = 0;
   var prevTokenStart = 0;
   var prevTokenEnd = 0;
   var valStart = 0;
   var valLen = 0;
   var token;
   var errors = [];

   function get (pos)
   {
      return spec.charAt (pos);
   }

   function next ()
   {
      valLen = 0;
      prevTokenStart = tokenStart;
      prevTokenEnd = take;
      
      skipWs ();

      if (take >= end)
	 token = tok.End;
      else
      {
	 tokenStart = take;
	 valLen = 1;
	 var c = get (take ++);
	 var remaining = end - take;
	 switch (c)
	 {
	 case '=': token = tok.Eq; break;
	 case '/': token = tok.Slash; break;
	 case '[': token = tok.Lpar; break;
	 case ']': token = tok.Rpar; break;
	 case '<': readValStr (); break;
	 case '#': readAnnotStr (); break;

	 case '.':
            token = tok.Ellipsis;
            if (remaining >= 2 && spec.slice (take, take + 2) == "..")
	    {
	       valLen = 3;
               take += 2;
	    }
            else
               addError ("Expected ellipsis ('...')");
            break;

	 case '-':
            if (remaining >= 1 && get (take) == '-')
            {
	       valLen = 2;
               token = tok.DblDash;
               ++ take;
            }
            else
               token = tok.Dash;
            break;

	 default:
            readId ();
            break;
	 }
      }
   }

   function readValStr ()
   {
      token = tok.ValStr;
      valStart = take;
      for (valLen = 0; take < end; ++ take, ++ valLen)
      {
	 if (get (take) == '>')
	 {
	    ++ take;
	    break;
	 }
      }
   }

   function readAnnotStr ()
   {
      token = tok.AnnotStr;
      
      // Skip leading space
      
      for (; take < end; ++ take)
	 if (get (take) != ' ')
            break;

      valStart = take;
      for (valLen = 0; take < end; ++ take, ++ valLen)
      {
	 var c = get (take);
	 if (isWs (c))
	 {
            if (c == ' ')
            {
               if (isWs (take + 1 < end ? get (take + 1) : ' '))
		  break;
            }
            else
               break;
	 }
      }

      // Trim trailing spaces
      
      while (valLen > 0 && get (valStart + valLen - 1) == ' ')
	 -- valLen;
   }

   function readId ()
   {
      token = tok.Id;
      valStart = tokenStart;
      for (valLen = 1; take < end; ++ take, ++ valLen)
      {
	 var c = get (take);
	 switch (c)
	 {
	 case '/': case '<': case '#': case '[': case ']': case '=':
            return;
	 case '.':
	    if ((end - take) >= 3 && spec.slice (take, take + 3) === "...")
	       return;
	    break;
	 default:
            if (isWs (c))
               return;
            break;
	 }
      }
   }

   function isWs (c)
   {
      return c == ' ' || c == '\n' || c == '\t' || c == '\r';
   }
   
   function skipWs ()
   {
      for (; take < end; ++ take)
	 if (! isWs (get (take)))
            break;
   }

   function nextVal (t)
   {
      if (token === t)
      {
	 var val = spec.slice (valStart, valStart + valLen);
	 next ();
	 return val;
      }
      else
	 return "";
   }

   function nextTok (t)
   {
      if (token === t)
      {
	 next ();
	 return true;
      }
      else
	 return false;
   }

   function addError (msg, def)
   {
      if (def)
	 msg += ": " + def;

      if (prevTokenEnd != 0)
      {
	 var from = prevTokenStart;
	 while (from > 0 && ! isWs (get (from - 1)))
            -- from;
	 
	 var preview;
	 var MaxPreview = 60;
	 var len = prevTokenEnd - from;
	 if (len > MaxPreview)
	    preview = spec.slice (prevTokenEnd - MaxPreview, prevTokenEnd);
	 else
	    preview = spec.slice (from, prevTokenEnd);

	 msg += "\n     \"" + preview + "\" <--";
      }

      errors.push (msg);
   }

   function getTokenName (t)
   {
      switch (t)
      {
      case tok.End:      return "end of specification";
      case tok.Id:       return "identifier";
      case tok.Ellipsis: return "'...'";
      case tok.DblDash:  return "'--'";
      case tok.ValStr:   return "'<'";
      case tok.AnnotStr: return "'#'";
      case tok.Lpar:     return "'['";
      case tok.Rpar:     return "']'";
      case tok.Dash:     return "'-'";
      case tok.Slash:    return "'/'";
      case tok.Eq:       return "'='";
      }
   }

   function addRequireError (t, what)
   {
      var detailed = "";
      if (what)
	 detailed = " (" + what + ")";
      addError ("Expected " + getTokenName (t) + detailed + " but got " +
		getTokenName (token));
   }

   function require (t, what)
   {
      var val = nextVal (t)
      if (! val)
	 addRequireError (t, what);
      return val;   
   }

   function defToString (def)
   {
      def = def || this;

      if (isPositional (def))
	 return def.longName;
      else if (def.onlyShort)
	 return "-" + def.shortName;
      else if (! def.shortName)
	 return "--" + def.longName;
      else
	 return "-" + def.shortName + "/--" + def.longName;
   }

   function newDef ()
   {
      var def = { 
	 type: type.Flag, optional: false, repeated: false, onlyShort: false,
	 annot: "", toString: defToString
      };
      parser.defs.push (def);
      return def;
   }

   function annotParam (def)
   {
      paramSpec (def);
      def.annot = annotSequence ();
   }
   
   function annotSequence ()
   {
      var annot;
      for (;;)
      {
	 var val = nextVal (tok.AnnotStr);
	 if (val)
	 {
	    if (annot)
	       annot += " " + val;
	    else
	       annot = val;
	 }
	 else
	    break;
      }
      return annot;
   }

   function paramSpec (def)
   {
      if (nextTok (tok.Lpar))
      {
	 def.optional = true;
	 param (def);
	 require (tok.Rpar);
      }
      else
	 param (def);
   }

   function param (def)
   {
      def.longName = nextVal (tok.Id, def.longName);
      if (def.longName)
	 def.type = type.Positional;
      else
	 option (def);

      if (! def.longName)
      {
	 def.onlyShort = true;
	 def.longName = def.shortName;
      }
      
      def.repeated = nextTok (tok.Ellipsis);

      if (isFlag (def) && ! def.optional)
	 addError ("Flag option must be optional");
   }

   function optType (def)
   {
      def.valAnnot = nextVal (tok.ValStr);
      if (def.valAnnot)
	 def.type = type.Param;
      else
	 def.type = type.Flag;      
   }

   function option (def)
   {
      if (nextTok (tok.Dash))
      {
	 def.shortName = require (tok.Id, "short name");
	 if (def.shortName.length != 1)
            addError ("Short name must be a single character");
	 if (nextTok (tok.Slash))
	 {
            require (tok.DblDash);
            def.longName = require (tok.Id, "long name");
	 }
	 optType (def);
      }
      else if (nextTok (tok.DblDash))
      {
	 def.longName = require (tok.Id, "long name");
	 optType (def);
      }
      else
	 addError ("Expected option or argument specifier");
   }

   function parseSpec ()
   {
      // Initialize first token

      next ();

      parser.prog = require (tok.Id, "program name");
      parser.progAnnot = annotSequence ();
      
      while (token != tok.End)
      {
	 var def = newDef ();
	 var prevStart = tokenStart;
	 annotParam (def);
	 addDef (def);

	 // Safeguard against endless parsing during error recovery: if
	 // we didn't consume anything this round, step ahead anyway

	 if (tokenStart == prevStart)
            next ();
      }

      if (errors.length == 0)
      {
	 // Add positionals sentinel

	 parser.positionals.push ({ 
	    def: { type: type.Positional, optional: true, repeated: true,
		   longName: "stray args" },
	 });

	 // Reverse positionals
	 
	 parser.positionals.reverse ();

	 // Make positional defs appear last

	 parser.defs.sort (function (d1, d2) { return d1.type - d2.type; });
      }
      else
	 throw ["Command line specification parse error:"]
	    .concat (errors).join ("\n   ");
   }

   function addDef (def)
   {
      if (def.longName)
      {
	 if (isPositional (def))
            parser.positionals.push ({ def: def });

	 addDefByName (def.longName, def);
	 if (def.shortName && def.shortName != def.longName)
            addDefByName (def.shortName, def);
      }
   }

   function isDefined (name)
   {
      return name in parser.defByName;
   }

   function addDefByName (name, def)
   {
      if (isDefined (name))
	 addError ("Duplicate parameter name: " + name, def);
      else
	 parser.defByName [name] = def;
   }

   function addDefaultDef (longName, shortName, valAnnot, annot)
   {
      var d = newDef ();
      d.longName = longName;
      if (! isDefined (shortName))
         d.shortName = shortName;
      d.type = valAnnot ? type.Param : type.Flag;
      d.optional = true;
      d.valAnnot = valAnnot;
      d.annot = annot;
      d.repeated = !! valAnnot;

      addDefByName (d.longName, d);
      if (d.shortName)
         addDefByName (d.shortName, d);
   }

   function setupDefaultDefs ()
   {
      if (! isDefined ("help"))
         addDefaultDef ("help", "h", "", "Print this help text");
   }

   parseSpec ();

   setupDefaultDefs ();
   
   return parser;
}

function parseParams (parser, args)
{
   var errors = [];
   var byName = { };
   var ordered = [];
   var pendingParam;
   var parsingStopped = false;
   var positionals = [].concat (parser.positionals);


   function addError (msg, def)
   {
      if (def)
	 msg += ": " + def;
      errors.push (msg);
   }

   function noSuchOption (name)
   {
      if (parser.props.ignoreUnknowns)
         return;

      if (name.length > 1)
	 addError ("No such command line option: --" + name);
      else
	 addError ("No such command line option: -" + name);
   }

   function appendParam (def, prm, val)
   {
      prm.push (val);
      ordered.push ({ name: def.longName, val: val });
   }

   function addArg (val)
   {
      var positional = positionals [positionals.length - 1];
      if (util.isUndefined (positional.param))
	 positional.param = getParam (positional.def); 

      appendParam (positional.def, positional.param, val);
   
      if (! positional.def.repeated)
	 positionals.pop ();
   }

   function setPendingParam (val)
   {
      appendParam (pendingParam, getParam (pendingParam), val);
      pendingParam = null;
   }

   function getParam (def)
   {
      var prm = byName [def.longName];
      if (! prm)
      {
	 prm = [];
	 byName [def.longName] = prm;
	 if (def.shortName)
            byName [def.shortName] = prm;
      }
      return prm;
   }

   function addParam (name)
   {
      var def = parser.defByName [name];
      if (def)
      {
	 if (isParam (def))
            pendingParam = def;
	 else if (isFlag (def))
            appendParam (def, getParam (def), "");
	 else
            noSuchOption (name);
      }
      else
	 noSuchOption (name);
   }

   function addParamWithVal (name, val)
   {
      var def = parser.defByName [name];
      if (def)
	 appendParam (def, getParam (def), val);
      else
	 noSuchOption (name);
   }

   function parseFlags (flags)
   {
      for (var i = 0, len = flags.length; i < len; ++ i)
      {
	 if (pendingParam)
	 {
            setPendingParam (flags.slice (i));
            break;
	 }
	 else
            addParam (flags.charAt (i));
      }
   }

   args.forEach (function (arg) {
      var len = arg.length;

      if (parsingStopped)
	 addArg (arg);
      else if (pendingParam)
	 setPendingParam (arg);
      else
      {
	 if (util.startsWith (arg, "--"))
	 {
            if (len > 2)
            {
               var eq = arg.indexOf ('=');
               if (eq > 0)
               {
		  var name = arg.slice (2, eq);
		  var val;
		  ++ eq;
		  if (eq < len)
                     val = arg.slice (eq);
		  addParamWithVal (name, val);
               }
               else
		  addParam (arg.slice (2));
            }
            else
               parsingStopped = true;
	 }
	 else if (util.startsWith (arg, "-"))
	 {
            if (len == 1)
               addArg (arg);
            else
               parseFlags (arg.slice (1));
	 }
	 else
            addArg (arg);
      }
   });

   if (pendingParam)
   {
      addError ("Missing value for command line option", pendingParam);
      setPendingParam ("");
   }
   
   var strayArgs = byName ["stray args"];
   if (strayArgs)
      strayArgs.forEach (function (arg) {
	 addError ("Stray command line argument: " + arg);
      });
   
   parser.defs.forEach (function (def) {

      var val = byName [def.longName];
      if (! def.optional && util.isUndefined (val))
      {
         var what = isParam (def) ? "option" : "argument";
         addError ("Missing mandatory command line " + what, def);
      }

      if (util.isDefined (val))
      {
         if (isFlag (def))
         {
	    for (var i = 0, len = val.length; i < len; ++ i)
	       if (val [i])
	       {
                  addError (
		     "This command line option does not take an argument",
                     def);
                  break;
               }
         }
         else
         {
            if (! def.repeated && val.length > 1)
               addError ("Command line option specified more than once", def);
         }
      }
   });

   var report;

   if (errors.length > 0)
   {
      if (errors.length == 1)
         report = errors [0];
      else
	 report = ["Command line errors:"].concat (errors).join ("\n   ");
   }

   function get (name, fallback)
   {
      var val = byName [name];
      if (val && val.length > 0)
	 return val [0];
      else
	 return fallback || "";
   }
   
   function getList (name, fallback)
   {
      return byName [name] || fallback || [];
   }

   function has (name)
   {
      return name in byName;
   }

   function count (name)
   {
      var val = byName [name];
      return val ? val.length : 0;
   }

   function getOrderedParams ()
   {
      return ordered;
   }
   
   function getParams ()
   {
      return byName;
   }

   function getSpec ()
   {
      return parser.spec;
   }

   var cl = util.toInterface (
      get, getList, has, count, getParams, getOrderedParams,
      getSpec
   );

   return { report: report, cl: cl }
}

function printUsageOrValidate (result, parser, props)
{
   if (result.cl.has ("help"))
   {
      console.log (getUsage (parser, props));
      return true;
   }
   else if (! result.report)
      return false;
   else
      throw getErrorReport (result, parser);
}

function getErrorReport (result, parser)
{
   return result.report + "\n\nSee '" + parser.prog + " " + 
      parser.defByName ["help"] + "' for usage details\n";
}

function getUsage (parser, props)
{
   var MaxLineSize = 79;
   var indent = 0;
   var curLineSize = 0;
   var result = [];

   function spaces (len)
   {
      return Array (len + 1).join (' ');
   }

   function put ()
   {
      util.append (result, util.toArray (arguments));
   }

   function clearNl ()
   {
      put ("\n\n");
      curLineSize = 0;
   }
      
   function addWord (word)
   {
      var len = word.length + 1;
      if (curLineSize + len + 1 > MaxLineSize)
      {
	 put ('\n', spaces (indent));
         curLineSize = indent;
      }

      if (curLineSize == 0)
      {
         put (word);
         curLineSize += len - 1;
      }
      else
      {
         put (' ', word);
         curLineSize += len;
      }
   }

   function addSentence (sentence)
   {
      sentence.split (" ").forEach (addWord);
   }

   function synopsis (def)
   {
      var syn = "";

      if (isPositional (def))
	 syn = def.longName;
      else
      {
	 if (def.shortName)
            syn = "-" + def.shortName;
	 else
            syn = "--" + def.longName;

	 if (isParam (def))
            syn += " <" + def.valAnnot + ">";
      }

      if (def.repeated)
	 syn += "...";

      if (def.optional)
	 syn = "[" + syn + "]";

      return syn;
   }

   var head = "Usage: " + parser.prog;

   addWord (head);
   indent = head.length;
   
   // Create synopsis, and build up left hand side column

   var lhs = [];
   var maxLhsWidth = 0;
   var hasPositionals = false;
   var hasOptions = false;

   parser.defs.forEach (function (def) {
      // Add to the synopsis
      
      addWord (synopsis (def));

      // Create lhs entry
      
      var entry = "   ";

      if (isPositional (def))
      {
         hasPositionals = true;
         entry += def.longName;
      }
      else
      {
         hasOptions = true;
         
         if (def.onlyShort)
            entry += "-" + def.shortName;
         else if (! def.shortName)
            entry += "--" + def.longName;
         else
            entry += "-" + def.shortName + " --" + def.longName;

         if (def.valAnnot)
         {
            if (def.onlyShort)
               entry += " ";
            else
               entry += "=";
            entry += "<" + def.valAnnot + ">";
         }
      }

      lhs.push (entry);
      maxLhsWidth = Math.max (maxLhsWidth, entry.length);
   });

   if (parser.progAnnot)
   {
      clearNl ();
      addWord ("Description:");
      clearNl ();
      addWord ("   ");
      indent = 3;
      addSentence (parser.progAnnot);
   }

   indent = maxLhsWidth;

   function addEntry (def, pos)
   {
      clearNl ();
      var entry = lhs [pos];
      var pad = spaces (maxLhsWidth - entry.length);
      addWord (entry + pad);
      addSentence (def.annot || "");
   }

   if (hasPositionals)
   {
      clearNl ();
      addWord ("Arguments:");

      parser.defs.forEach (function (def, pos) {
         if (isPositional (def))
	    addEntry (def, pos);
      });
   }

   if (hasOptions)
   {
      clearNl ();
      addWord ("Options:");

      parser.defs.forEach (function (def, pos) {
         if (! isPositional (def))
	    addEntry (def, pos);
      });
   }

   return result.join ("");
}

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

"use strict";

var util = require ("./util");
var ndu = require ("util");
var fs = require ("fs");
var path = require ("path");

module.provide (
   entity,
   renderJava,
   getJavaFilename,
   renderCc,
   tail,
   indent,
   noindent,
   setVariables
);

var variables = "";

function setVariables (s)
{
   variables = s;
}

function entity ()
{
   return new Entity ();
}

function getJavaFilename (dir, pkg, name)
{
   var p = dir + "/" + (pkg ? pkg + "/" : "") + name +  ".java";
   return p;
}

function renderJava (ent, name, pkg, dir, verbosity)
{
   pkg = (pkg || "").replace (/\./g, "/");
   var p = getJavaFilename (dir, pkg, name);
   if (fs.existsSync (dir))
      util.mkdir (path.dirname (p));
   else
      throw "Target directory '" + dir + "' must exist"; 
   if (verbosity > 0)
      console.log ("Writing output to " + p);

   fs.writeFileSync (p, renderCurlyBraceFamily (ent));

   return p;
}

function renderCc (ent, file, verbosity)
{
   if (verbosity > 0)
      console.log ("Writing output to " + file);
   fs.writeFileSync (file, renderCurlyBraceFamily (ent));
}

function renderCurlyBraceFamily (ent)
{
   var data = [];
   var level = 0;

   var walker = {
      onEntity: function (e) {
         walk (e.comps, walker);
      },
      onBlock: function (b) {
         if (b.text)
            indentedln (b.text, b.indent, b.noindent);
         indentedln ("{");
         ++ level;
         walk (b.comps, walker);
         -- level;
	 if (b.tail)
            indentedln ("}" + b.tail);
	 else
            indentedln ("}");
      },
      onLine: function (t)
      {
         indentedln (t.text, t.indent);
      },
      onComment: function (t)
      {
         indentedln (makeComment (t.text));
      },
      onList: function (b) {
         if (b.text)
            indentedln (b.text, b.indent, b.noindent);
         indentedln ("{");
         ++ level;
         walk (b.comps, listWalker);
         -- level;
	 if (b.tail)
            indentedln ("}" + b.tail);
	 else
            indentedln ("}");
      }
   };

   var listWalker = {
      onEntity: function (e) {
         walk (e.comps, walker);
      },
      onBlock: function (b, pos, a) {
         if (b.text)
            indentedln (b.text, b.indent, b.noindent);
         indentedln ("{");
         ++ level;
         walk (b.comps, walker);
         -- level;
         indentedsepln ("}", ",", pos, a);
      },
      onLine: function (t, pos, a)
      {
         indentedsepln (t.text, ",", pos, a, t.indent);
      },
      onComment: function (t, pos, a)
      {
         indentedln (makeComment (t.text));
      },
      onList: function (b, pos, a) {
         if (b.text)
            indentedln (b.text, b.indent, b.noindent);
         indentedln ("{");
         ++ level;
         walk (b.comps, listWalker);
         -- level;
         indentedsepln ("}", ",", pos, a);
      }
   };

   function indented (t, adjust, noindent_)
   {
      var indent_;
      if (noindent_)
         indent_ = 0;
      else
         indent_ = level * 2 + (adjust || 0);
      data.push (util.repeat (" ", indent_));
      data.push (t);
   }

   function indentedln (t, adjust, noindent_)
   {
      indented (t, adjust, noindent_);
      data.push ("\n");
   }

   function indentedsepln (t, sep, pos, a, adjust)
   {
      indented (t, adjust);
      if (pos < a.length - 1)
         data.push (sep + "\n");
      else
         data.push ("\n");
   }

   function makeComment (t)
   {
      return "// " + t.replace (/\n/g, util.repeat (" ", level * 2) + "// ");
   }

   walk (ent, walker);
   return data.join ('');
}

function tail ()
{
   var t = merge (util.toArray (arguments));
   return function (comp) { comp.tail = t; };
}

function indent (amount)
{
   return function (comp) { comp.indent = amount; };
}

function noindent ()
{
   return function (comp) { comp.noindent = true; };
}

function Entity ()
{
   this.comps = [];
}

util.extend (Entity.prototype, {
   ln: function () { 
      this.comps.push (create (Line, util.toArray (arguments)));
      return this;
   },
   comment: function () { 
      this.comps.push (create (Comment, util.toArray (arguments)));
      return this;
   },
   block: function () { 
      var comp = create (Block, util.toArray (arguments));
      this.comps.push (comp);
      return comp;
   },
   list: function () { 
      var comp = create (List, util.toArray (arguments));
      this.comps.push (comp);
      return comp;
   },
   visit: function (w, pos, a) { visit (w.onEntity, w, this, pos, a); },
   append: function (ent) {
      util.append (this.comps, ent.comps);
   }
});

function create (ctor, args)
{
   var comp = new ctor ();
   comp.text = merge (args, comp);
   return comp;
}

function merge (args, comp)
{
   var t = [];
   for (var i = 0; i < args.length; ++ i)
   {
      var a = args [i];
      if (util.isArray (a))
         t.push (merge (a, comp));
      else if (util.isFunction (a))
         t.push (a (comp) || "");
      else
      {
         a = a.toString ();
         if (isFormat (a))
         {
            t.push (format (a, util.flatten (args.slice (i + 1))));
            break;
         }
         else
            t.push (a);
      }
   }
   return t.join ('');
}

function isFormat (f)
{
   return !! f.match ("[%" + variables + "]");
}

function format (f, args)
{
   if (variables)
   {
      var pat = new RegExp ("(\\\\?[" + variables + "]|%s|%d)");
      var parts = f.split (pat);
      var bindings = { };
      return parts.map (function (p) {
         if (p.length === 1 && variables.indexOf (p) !== -1)
         {
            if (! (p in bindings))
            {
               if (args.length)
                  bindings [p] = args.splice (0, 1) [0];
               else
                  bindings [p] = p;

            }

            return bindings [p];
         }
         else if (p.length === 2 && p.charAt (0) === '\\' &&
                  variables.indexOf (p.charAt (1)) !== -1)
         {
            return p.charAt (1);
         }
         else if (args.length && (p === "%s" || p === "%d"))
         {
            return ndu.format (p, args.splice (0, 1) [0]);
         }
         else
            return p;
      }).join ('');
   }
   else
      return ndu.format.apply (ndu, [f].concat (args));
}

function Line ()
{
   this.text = "";
}

util.extend (Line.prototype, {
   visit: function (w, pos, a) { visit (w.onLine, w, this, pos, a); }
});

function Comment ()
{
   this.text = "";
}

util.extend (Comment.prototype, {
   visit: function (w, pos, a) { visit (w.onComment, w, this, pos, a); }
});

function Block () // extends Entity
{
   Entity.call (this);
   this.text = "";
}

Block.prototype = new Entity ();
Block.prototype.constructor = Block;
util.extend (Block.prototype, {
   visit: function (w, pos, a) { visit (w.onBlock, w, this, pos, a); }
});

function List () // extends Block
{
   Block.call (this);
}

List.prototype = new Block ();
List.prototype.constructor = List;
util.extend (List.prototype, {
   visit: function (w, pos, a) { visit (w.onList, w, this, pos, a); }
});

function walk (comp, walker)
{
   if (util.isArray (comp))
      comp.forEach (function (c, pos) { c.visit (walker, pos, comp); });
   else
      comp.visit (walker);
}

function noop ()
{
}

function visit (primary, w, comp, pos, a)
{
   (primary || w.onAny || noop).call (w, comp, pos, a);
}

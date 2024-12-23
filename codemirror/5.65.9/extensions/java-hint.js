// (c) 2017 Soffid

var CodeMirrorJavaTypes={};
var CodeMirrorJavaPackages={};

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    mod(require("../../lib/codemirror"));
  else if (typeof define == "function" && define.amd) // AMD
    define([ "../../lib/codemirror" ], mod);
  else
    // Plain browser env
    mod(CodeMirror);
})
(function(CodeMirror) {
  var Pos = CodeMirror.Pos;

  function forEach(arr, f) {
    for (var i = 0, e = arr.length; i < e; ++i)
      f(arr[i]);
  }

  function arrayContains(arr, item) {
    if (!Array.prototype.indexOf) {
      var i = arr.length;
      while (i--) {
        if (arr[i] === item) {
          return true;
        }
      }
      return false;
    }
    return arr.indexOf(item) != -1;
  }

  function previousToken(editor, getToken, tprop) {
    if (tprop == null)
      return null;
    else if (tprop.start > 0) {
      t = getToken(editor, Pos(tprop.line, tprop.start));
      t.line = tprop.line;
      return t;
    } else if (tprop.line > 0) {
      t = getToken(editor, Pos(tprop.line - 1, 999));
      t.line = tprop.line - 1;
      return t;
    } else {
      return null;
    }
  }

  function scriptHint(editor, keywords, getToken, options) {
    // Find the token at the cursor
    var cur = editor.getCursor(), token = getToken(editor, cur);

    if (/\b(?:string|comment)\b/.test(token.type))
      return;
    token.state = CodeMirror.innerMode(editor.getMode(),
      token.state).state;

    // If it's not a 'word-style' token, ignore the token.
    if (!/^[\w$_]*$/.test(token.string)) {
      token = {
        start : cur.ch,
        end : cur.ch,
        string : "",
        state : token.state,
        type : token.string == "." ? "property" : null
      };
    } else if (token.end > cur.ch) {
      token.end = cur.ch;
      token.string = token.string.slice(0, cur.ch - token.start);
    }
    token.line = cur.line;

    var tprop = token;
    // If it is a property, find out what it is a property of.
    var end = false;
    var first = true;

    var context = [];
    while (!end && (tprop.type == "property" || (tprop.type == 'variable' || first) || tprop.string.startsWith ('{'))) {
      first = false;
      var hasDot = ( tprop.type == "property" ) ;

      if (hasDot)
      {
        tprop = previousToken(editor, getToken, tprop);
        if (tprop.string != ".")
          break;

        tprop = previousToken(editor, getToken, tprop);
      } else {
        tprop = previousToken(editor, getToken, tprop);
      }
      if (tprop == null)
        break;
      if (tprop.string == ")") {
        p = 1;
        while (!end && p > 0) {
          tprop = previousToken(editor, getToken, tprop);
          if (tprop == null)
            end == true;
          else if (tprop.string == '(')
            p--;
          else if (tprop.string == ')')
            p++;
          else if (tprop.string == ';')
            end = true;
        }
        tprop = previousToken(editor, getToken, tprop);
      } else if (tprop.string == "]") {
        p = 1;
        while (!end && p > 0) {
          tprop = previousToken(editor, getToken, tprop);
          if (tprop == null)
            end == true;
          else if (tprop.string == '[')
            p--;
          else if (tprop.string == ']')
            p++;
          else if (tprop.string == ';')
            end = true;
        }
        tprop = previousToken(editor, getToken, tprop);
      } else if (tprop.string == "}") {
        var buffer = '}';
        p = 1;
        while (!end && p > 0) {
          tprop = previousToken(editor, getToken, tprop);
          buffer = tprop.string + buffer;
          if (tprop == null)
            end == true;
          else if (tprop.type == 'string')
          {

          }
          else if (tprop.string == '{')
            p--;
          else
            end = true;
        }

        if (end) break;
        tprop = {type:'map', string: buffer, line: tprop.line, start: tprop.start, end: tprop.end};
      }


      tprop.hasDot = hasDot;
      if (tprop.string.trim() != '')
        context.unshift(tprop);
    }
    return {
      list : getCompletions(token, context, keywords, options),
      from : Pos(cur.line, token.start),
      to : Pos(cur.line, token.end)
    };
  }

  function javaHint(editor, options) {
    return scriptHint(editor, javascriptKeywords, function(e, cur) {
      return e.getTokenAt(cur);
    }, options);
  }
  ;
  CodeMirror.registerHelper("hint", "java", javaHint);

  var stringProps = ("charAt charCodeAt indexOf lastIndexOf substring startsWith trim "
    + "toUpperCase toLowerCase split concat match replace search")
    .split(" ");
  var arrayProps = ("length ").split(" ");
  var objectProps = ("get put ").split(" ");
  var serviceLocator = "prototype apply call bind".split(" ");
  var javascriptKeywords = ("break case catch continue default do else false finally for class "
    + "if instanceof new null return switch throw true try int long String Date void while")
    .split(" ");

  function getCompletions(token, context, keywords, options) {
    var found = [], start = token.string, global = options
      && options.globalScope;
    function maybeAdd(str) {
      if (str.toLowerCase().lastIndexOf(start.toLowerCase(), 0) == 0
        && !arrayContains(found, str))
        found.push(str);
    }
    /*
     * function gatherCompletions(obj) { if (typeof obj == "string")
     * forEach(stringProps, maybeAdd); else if (obj instanceof
     * Array) forEach(arrayProps, maybeAdd); else if (obj instanceof
     * Function) forEach(funcProps, maybeAdd); for (var name in obj)
     * maybeAdd(name); }
     */
    var javaType = null;
    var hasDot;
    if (context && context.length) {
      // If this is a property, see if it belongs to some object
      // we can
      // find in the current environment.
      var currentType = null;
      for (var o = 0; o < context.length; o++) {
        hasDot = context[o].hasDot;
        var currentToken = context[o].string;
        if (javaType == null)
        {
          if ( currentType == null) currentType = currentToken;
          else currentType = currentType + '.' + currentToken;

          if ( options.globalVars[currentType] ) // Global Variable
          {
            currentType = options.globalVars[currentType];
            javaType = CodeMirrorJavaTypes[currentType];
          }
          else if (CodeMirrorJavaTypes[currentType])
            javaType = CodeMirrorJavaTypes[currentType];
          else if (CodeMirrorJavaTypes['java.lang.'+currentType])
            javaType = 'java.lang.'+current;
          else if (CodeMirrorJavaTypes['java.util.'+currentType])
            javaType = 'java.util.'+current;
        } else {
          currentType = javaType[currentToken];
          if ( currentType == null)
          {
            javaType = null;
            currentType = currentToken;
          }
          else
          {
            javaType = CodeMirrorJavaTypes[currentType];
          }
        }
      }

      if (javaType == null && CodeMirrorJavaPackages != null && CodeMirrorJavaPackages[currentType] != null)
      {
        var members = CodeMirrorJavaPackages[currentType];
        for (var i=0; i < members.length; i++)
        {
          var m = members[i];
          maybeAdd(m);
        }
      }

      if (javaType)
      {
        for ( m in javaType)
        {
          if (hasDot && ! m.startsWith('{') ||
            ! hasDot && m.startsWith('{'))
            maybeAdd(m);
        }
      }

    } else {
      // If not, just look in the global object and any local
      // scope
      // (reading into JS mode internals to get at the local and
      // global
      // variables)
      for (var v = token.state.localVars; v; v = v.next)
        maybeAdd(v.name);
      for (var v = token.state.globalVars; v; v = v.next)
        maybeAdd(v.name);
      // if (!options || options.useGlobalScope !== false)
      // gatherCompletions(global);
      for (i in options.globalVars)
        maybeAdd(i);
      forEach(keywords, maybeAdd);
      forEach(CodeMirrorJavaPackages[""], maybeAdd);
      var dt = options.globalVars[token.string];
      if (dt)
      {
        javaType = CodeMirrorJavaTypes[dt];

        if (javaType)
        {
          for ( method in javaType)
          {
            if (method.startsWith('{'))
              found.push(token.string+method);
          }
        }
      }
    }
    found.sort();
    return found;
  }
});

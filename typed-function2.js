/**
 * typed-function
 *
 * Type checking for JavaScript functions
 *
 * https://github.com/josdejong/typed-function
 */
'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define([], factory);
  } else if (typeof exports === 'object') {
    // OldNode. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like OldNode.
    module.exports = factory();
  } else {
    // Browser globals (root is window)
    root.typed = factory();
  }
}(this, function () {
  function ok (x) {
    return true;
  }

  // create a new instance of typed-function
  function create () {
    // data type tests
    var _types = [
      { name: 'number',    test: function (x) { return typeof x === 'number' } },
      { name: 'string',    test: function (x) { return typeof x === 'string' } },
      { name: 'boolean',   test: function (x) { return typeof x === 'boolean' } },
      { name: 'Function',  test: function (x) { return typeof x === 'function'} },
      { name: 'Array',     test: Array.isArray },
      { name: 'Date',      test: function (x) { return x instanceof Date } },
      { name: 'RegExp',    test: function (x) { return x instanceof RegExp } },
      { name: 'Object',    test: function (x) { return typeof x === 'object' } },
      { name: 'null',      test: function (x) { return x === null } },
      { name: 'undefined', test: function (x) { return x === undefined } },
      { name: 'any',       test: ok}
    ];

    // types which need to be ignored
    var _ignore = [];

    // This is a temporary object, will be replaced with a typed function at the end
    var typed = {
      types: _types,
      ignore: _ignore
    };

    /**
     * Find the test function for a type
     * @param {String} type
     * @return {function} Returns the test function of the type when found,
     *                    Throws a TypeError otherwise
     */
    function findTest (type) {
      var entry = typed.types.find(function (entry) {
        return entry.name === type;
      });

      if (entry) {
        return entry.test;
      }

      var hint = typed.types.find(function (entry) {
        return entry.name.toLowerCase() === type.toLowerCase();
      });

      throw new TypeError('Unknown type "' + type + '"' +
          (hint ? ('. Did you mean "' + hint.name + '"?') : ''));
    }

    /**
     * Create a type test for a single parameter, like 'number' or 'string | Function'
     * @param {String} param
     * @return {function(x: *) : boolean}
     */
    function parseParam(param) {
      var types = param.split('|').map(trim).filter(notEmpty).filter(notIgnore);

      if (types.length === 0) {
        // nothing to do
        return ok;
      }
      else if (types.length === 1) {
        return findTest(types[0]);
      }
      else if (types.length === 2) {
        var test0 = findTest(types[0]);
        var test1 = findTest(types[1]);
        return function or(x) {
          return test0(x) || test1(x);
        }
      }
      else { // types.length > 2
        var tests = types.map(function (type) {
          return findTest(type);
        })
        return function or(x) {
          for (var i = 0; i < tests.length; i++) {
            if (tests[i](x)) {
              return true;
            }
          }
          return false;
        }
      }
    }

    /**
     * Create a test for all parameters of a signature
     * @param {string} signature
     * @return {function(args: Array<*>) : boolean}
     */
    function parseParams(signature) {
      var params = signature.split(',').map(trim);
      var tests;

      var test0, test1;

      var varArgsIndex = signature.indexOf('...')
      if (varArgsIndex !== -1) { // variable arguments
        if (signature.lastIndexOf(',') > varArgsIndex) {
          throw new SyntaxError('Variable argument operator "..." only allowed for the last parameter');
        }

        tests = initial(params).map(parseParam);
        var varIndex = tests.length;
        var lastTest = parseParam(last(params).replace(/^.../, ''));
        var testVarArgs = function (args) {
          for (var i = varIndex; i < args.length; i++) {
            if (!lastTest(args[i])) {
              return false;
            }
          }
          return true;
        }

        return function testArgs(args) {
          for (var i = 0; i < tests.length; i++) {
            if (!tests[i](args[i])) {
              return false;
            }
          }
          return testVarArgs(args) && (args.length >= varIndex + 1);
        };
      }
      else { // no variable arguments
        if (params.length === 0) {
          return function testArgs(args) {
            return args.length === 0;
          };
        }
        else if (params.length === 1) {
          test0 = parseParam(params[0]);
          return function testArgs(args) {
            return test0(args[0]) && args.length === 1;
          };
        }
        else if (params.length === 2) {
          test0 = parseParam(params[0]);
          test1 = parseParam(params[1]);
          return function testArgs(args) {
            return test0(args[0]) && test1(args[1]) && args.length === 2;
          };
        }
        else { // arguments.length > 2
          tests = params.map(parseParam);
          return function testArgs(args) {
            for (var i = 0; i < tests.length; i++) {
              if (!tests[i](args[i])) {
                return false;
              }
            }
            return args.length === tests.length;
          };
        }
      }
    }

    function createError(name, args) {
      var typesList = Array.prototype.map.call(args, function (arg) {
        var entry = typed.types.find(function (entry) {
          return entry.test(arg);
        });
        return entry ? entry.name : 'unknown';
      });

      return new Error('Signature "' + typesList.join(', ') +
          '" doesn\'t match any of the defined signatures of function ' +
          (name || 'unnamed') + '.');
    }

    /**
     * Turn an object with signatures into an array, sorted by
     * @param signatures
     */
    function sortSignatures (signatures) {
      // TODO: sort the signatures
    }

    function createVarArgPreProcess (signature) {
      var offset = signature.split(',').length - 1;
      return function (args) {
        return slice(args, 0, offset).concat([slice(args, offset)])
      }
    }

    /**
     * Create a typed function
     * @param {String} name               The name for the typed function
     * @param {Object.<string, function>} signatures An object with one or
     *                                    multiple signatures as key, and the
     *                                    function corresponding to the
     *                                    signature as value.
     * @return {function}  Returns the created typed function.
     */
    function createTypedFunction(name, signatures) {
      // parse the signatures
      var defs = [];
      for (var signature in signatures) {
        // noinspection JSUnfilteredForInLoop
        if (hasOwnProperty(signatures, signature)) {
          // noinspection JSUnfilteredForInLoop
          var varArg = signature.indexOf('...') !== -1;
          // noinspection JSUnfilteredForInLoop
          defs.push({
            signature: signature.replace(/ /g, ''),
            varArg: varArg,
            preprocess: varArg ? createVarArgPreProcess(signature) : null,
            test: parseParams(signature),
            fn: signatures[signature]
          });
        }
      }

      // create the typed function
      var fn = function () {
        for (var i = 0; i < defs.length; i++) {
          if (defs[i].test(arguments)) {
            if (defs[i].varArg) {
              return defs[i].fn.apply(null, defs[i].preprocess(arguments));
            }
            else {
              return defs[i].fn.apply(null, arguments);
            }
          }
        }

        throw createError(name, arguments);
      }

      // attach name and signatures to the typed function
      Object.defineProperty(fn, 'name', {value: name});
      fn.signatures = {}
      defs.forEach(function (def) {
        fn.signatures[def.signature] = def.fn;
      });

      return fn;
    }

    // Test whether a type should be NOT be ignored
    function notIgnore(type) {
      return typed.ignore.indexOf(type) === -1;
    }

    // secure version of object.hasOwnProperty
    function hasOwnProperty(object, prop) {
      return Object.hasOwnProperty.call(object, prop);
    }

    // trim a string
    function trim(str) {
      return str.trim();
    }

    // test whether a string is undefined or empty
    function notEmpty(str) {
      return !!str;
    }

    // return all but the last items of an array
    function initial(arr) {
      return arr.splice(0, arr.length - 1);
    }

    // return the last item of an array
    function last(arr) {
      return arr[arr.length - 1];
    }

    function slice(arr, start, end) {
      return Array.prototype.slice.call(arr, start, end);
    }

    /**
     * Find the first typed function in a set of signatures, and return the
     * name of this function
     * @param {Object<string, function>} signatures
     * @return {string | null}  Returns the name of the first typed function
     *                          Returns null if not found
     */
    function findTypedFunctionName(signatures) {
      for (var signature in signatures) {
        // noinspection JSUnfilteredForInLoop
        if (hasOwnProperty(signatures, signature)) {
          // noinspection JSUnfilteredForInLoop
          if (signatures[signature].signatures) { // test whether a typed-function
            // noinspection JSUnfilteredForInLoop
            return signatures[signature].name; // copy the first name of a typed function
          }
        }
      }
      return null;
    }

    typed = createTypedFunction('typed', {
      'string, Object': createTypedFunction,
      'Object': function (signatures) {
        // find existing name
        var name = findTypedFunctionName(signatures) || '';
        return createTypedFunction(name, signatures);
      }
    });

    typed.create = create;
    typed.types = _types;
    typed.ignore = _ignore;

    // add a type
    typed.addType = function (type) {
      if (!type || typeof type.name !== 'string' || typeof type.test !== 'function') {
        throw new TypeError('Object with properties {name: string, test: function} expected');
      }

      typed.types.push(type);
    };

    // add a conversion
    typed.addConversion = function (conversion) {
      if (!conversion
          || typeof conversion.from !== 'string'
          || typeof conversion.to !== 'string'
          || typeof conversion.convert !== 'function') {
        throw new TypeError('Object with properties {from: string, to: string, convert: function} expected');
      }

      typed.conversions.push(conversion);
    };

    return typed;
  }

  return create();
}));
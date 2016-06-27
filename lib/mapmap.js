(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.mapmap = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*! datadata.js © 2014-2015 Florian Ledermann 

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';

// test whether in a browser environment
if (typeof window === 'undefined') {
    // node
    var d3dsv = require('d3-dsv');
    var fs = require('fs');
    
    var fileparser = function(func) {
        return function(path, row, callback) {
            if (dd.isUndefined(callback)) {
                callback = row;
                row = null;
            }
            fs.readFile(path, 'utf8', function(error, data) {
                if (error) return callback(error);
                data = func(data, row);
                callback(null,data);
            });
        };
    };
    
    var d3 = {
        csv: fileparser(d3dsv.csv.parse),
        tsv: fileparser(d3dsv.tsv.parse),
        json: fileparser(JSON.parse)
    };

} else {
    // browser
    // we expect global d3 to be available
    var d3 = window.d3;
}


function rowFileHandler(loader) {
    // TODO: file handler API should not need to be passed map, reduce functions but be wrapped externally
    return function(path, map, reduce, options) {
    
        options = dd.merge({
            // default accessor function tries to convert number-like strings to numbers
            accessor: function(d) {
                var keys = Object.keys(d);
                for (var i=0; i<keys.length; i++) {
                    var key = keys[i],
                        val = d[key];
                    // CSV doesn't support specification of null values
                    // interpret empty field values as missing
                    if (val === "") {
                        d[key] = null;
                    }
                    else if (dd.isNumeric(val)) {
                        // unary + converts both ints and floats correctly
                        d[key] = +val;
                    }
                }
                return d;
            }
        }, options);
        
        return new Promise(function(resolve, reject) {
            loader(path, options.accessor,
                function(error, data) {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve(dd.mapreduce(data, map, reduce));                    
                }
            );
        }); 
    };
}

function jsonFileHandler(path, map, reduce) {
    return new Promise(function(resolve, reject) {
        d3.json(path, function(error, data) {
            if (error) {
                reject(error);
                return;
            }
                                
            if (dd.isArray(data)) {
                resolve(dd.mapreduce(data, map, reduce));
            }
            else {
                // object - treat entries as keys by default
                var keys = Object.keys(data);
                var map_func;
                if (!map) {
                    // use keys as data to emit key/data pairs in map step!
                    map_func = dd.map.dict(data);
                }
                else {
                    map_func = function(k, emit) {
                        // put original key into object
                        var v = data[k];
                        v.__key__ = k;
                        // call user-provided map funtion with object
                        map(v, emit);
                    };
                }
                resolve(dd.mapreduce(keys, map_func, reduce));
            }                    
        });
    });
}

var fileHandlers = {
    'csv':  rowFileHandler(d3.csv),
    'tsv':  rowFileHandler(d3.tsv),
    'json': jsonFileHandler
};

var getFileHandler = function(pathOrExt) {
    // guess type
    var ext = pathOrExt.split('.').pop().toLowerCase();
    return fileHandlers[ext] || null;
};

var registerFileHandler = function(ext, handler) {
    fileHandlers[ext] = handler;
};

// TODO: register .topojson, .geojson in mapmap.js

/**
Datadata - a module for loading and processing data.
You can call the module as a function to create a promise for data from a URL, Function or Array. 
Returns a promise for data for everything.
@param {(string|function|Array)} spec - A String (URL), Function or Array of data.
@param {(function|string)} [map={@link datadata.map.dict}]  - The map function for map/reduce.
@param {(string)} [reduce=datadata.emit.last] - The reduce function for map/reduce.
@exports module:datadata
*/
var dd = function(spec, map, reduce, options) {

    // options
    // type: override file extension, e.g. for API urls (e.g. 'csv')
    // fileHandler: manually specify file handler to be used to load & parse file
    options = options || {};

    if (spec == null) throw new Error("datadata.js: No data specification.");
        
    if (map && !dd.isFunction(map)) {
        // map is string -> map to attribute value
        map = dd.map.key(map);
    }
    
    if (dd.isString(spec)) {
        // consider spec to be a URL/file to load
        var handler = options.fileHandler || getFileHandler(options.type || spec);
        if (handler) {
            return handler(spec, map, reduce, options);
        }
        else {
            throw new Error("datadata.js: Unknown file type for: " + spec);
        }
    }
    if (dd.isArray(spec)) {
        return new Promise(function(resolve, reject) {
            resolve(dd.mapreduce(spec, map, reduce));
        });
    }
    throw new Error("datadata.js: Unknown data specification.");
};

// expose registration method & rowFileHandler helper
dd.registerFileHandler = registerFileHandler;
dd.rowFileHandler = rowFileHandler;

// simple load function, returns a promise for data without map/reduce-ing
// DO NOT USE - present only for mapmap.js legacy reasons
dd.load = function(spec, key) {
    if (spec.then && typeof spec.then === 'function') {
        // already a thenable / promise
        return spec;
    }
    else if (dd.isString(spec)) {
        // consider spec to be a URL to load
        // guess type
        var ext = spec.split('.').pop();
        if (ext == 'json' || ext == 'topojson' || ext == 'geojson') {
            return new Promise(function(resolve, reject) {
                d3.json(spec, function(error, data) {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve(data);
                });
            });
        }
        else {
            console.warn("Unknown extension: " + ext);
        }
    }
};


// Type checking
/**
Return true if argument is a string.
@param {any} val - The value to check.
*/
dd.isString = function (val) {
  return Object.prototype.toString.call(val) == '[object String]';
};
/**
Return true if argument is a function.
@param {any} val - The value to check.
*/
dd.isFunction = function(obj) {
    return (typeof obj === 'function');
};
/**
Return true if argument is an Array.
@param {any} val - The value to check.
*/
dd.isArray = function(obj) {
    return (obj instanceof Array);
};
/**
Return true if argument is an Object, but not an Array, String or anything created with a custom constructor.
@param {any} val - The value to check.
*/
dd.isDictionary = function(obj) {
    return (obj && obj.constructor && obj.constructor === Object);
};
/**
Return true if argument is undefined.
@param {any} val - The value to check.
*/
dd.isUndefined = function(obj) {
    return (typeof obj == 'undefined');
};
/**
Return true if argument is a number or a string that strictly looks like a number.
This method is stricter than +val or parseInt(val) as it doesn't validate the empty
string or strings contining any non-numeric characters. 
@param {any} val - The value to check.
*/
dd.isNumeric = function(val) {
    // check if string looks like a number
    // +"" => 0
    // parseInt("") => NaN
    // parseInt("123OK") => 123
    // +"123OK" => NaN
    // so we need to pass both to be strict
    return !isNaN(+val) && !isNaN(parseFloat(val));
}

// Type conversion / utilities
/**
If the argument is already an Array, return a copy of the Array.
Else, return a single-element Array containing the argument.
*/
dd.toArray = function(val) {
    if (!val) return [];
    // return a copy if aready array, else single-element array
    return dd.isArray(val) ? val.slice() : [val];
};

/**
Shallow object merging, mainly for options. Returns a new object.
*/
dd.merge = function() {
    var obj = {};

    for (var i = 0; i < arguments.length; i++) {
        var src = arguments[i];
        
        for (var key in src) {
            if (src.hasOwnProperty(key)) {
                obj[key] = src[key];
            }
        }
    }

    return obj;
};

/**
Return an {@link module:datadata.OrderedHash|OrderedHash} object.
@exports module:datadata.OrderedHash
*/
dd.OrderedHash = function() {
    // ordered hash implementation
    var keys = [];
    var vals = {};
    
    return {
        /**
        Add a key/value pair to the end of the OrderedHash.
        @param {String} k - Key
        @param v - Value
        */
        push: function(k,v) {
            if (!vals[k]) keys.push(k);
            vals[k] = v;
        },
        /**
        Insert a key/value pair at the specified position.
        @param {Number} i - Index to insert value at
        @param {String} k - Key
        @param v - Value
        */
        insert: function(i,k,v) {
            if (!vals[k]) {
                keys.splice(i,0,k);
                vals[k] = v;
            }
        },
        /**
        Return the value for specified key.
        @param {String} k - Key
        */
        get: function(k) {
            // string -> key
            return vals[k];
        },
        /**
        Return the value at specified index position.
        @param {String} i - Index
        */
        at: function(i) {
            // number -> nth object
            return vals[keys[i]];
        },
        length: function(){return keys.length;},
        keys: function(){return keys;},
        key: function(i) {return keys[i];},
        values: function() {
            return keys.map(function(key){return vals[key];});
        },
        map: function(func) {
            return keys.map(function(k){return func(k, vals[k]);});
        },
        unsorted_dict: function() {
            return vals;
        }
    };
};

// Utility functions for map/reduce
dd.map = {
    key: function(attr, remap) {
        return function(d, emit) {
            var key = d[attr];
            if (remap && remap[key] !== undefined) {
                key = remap[key];
            }
            emit(key, d);
        };
    },
    dict: function(dict) {
        return function(d, emit) {
            emit(d, dict[d]);
        };
    }
};
dd.emit = {
    ident: function() {
        return function(key, values, emit) {
            emit(key, values);
        };
    },
    first: function() {
        return function(key, values, emit) {
            emit(key, values[0]);
        };
    },
    last: function() {
        return function(key, values, emit) {
            emit(key, values[values.length - 1]);
        };
    },
    merge: function() {
        return function(key, values, emit) {
            var obj = values.reduce(function(prev, curr) {
                var keys = Object.keys(curr);
                for (var i=0; i<keys.length; i++) {
                    var k = keys[i];
                    prev[k] = curr[k];
                }
                return prev;
            });
            
            emit(key, obj);
        };
    },
    toAttr: function(attr, func) {
        func = func || dd.emit.last();
        return function(key, values, emit) {
            func(key, values, function(k, v) {
                var obj = {};
                obj[attr] = v;
                emit(k, obj);
            });
        };
    },
    sum: function(include, exclude) {
        include = wildcards(include || '*');
        exclude = wildcards(exclude);       

        return function(key, values, emit) {
            var obj = values.reduce(function(prev, curr) {
                var keys = Object.keys(curr);
                for (var i=0; i<keys.length; i++) {
                    var key = keys[i],
                        doAdd = false,
                        j;
                    
                    for (j=0; j<include.length; j++) {
                        if (key.search(include[i]) > -1) {
                            doAdd = true;
                            break;
                        }
                    }
                    for (j=0; j<exclude.length; j++) {
                        if (key.search(include[j]) > -1) {
                            doAdd = false;
                            break;
                        }
                    }
                    if (doAdd && prev[key] && curr[key] && !isNaN(prev[key]) && !isNaN(curr[key])) {
                        prev[key] = prev[key] + curr[key];
                    }
                    else {
                        prev[key] = curr[key];
                        if (doAdd) {
                            console.warn("datadata.emit.sum(): Cannot add keys " + key + "!");
                        }
                    }
                }
                return prev;
            });
            
            emit(key, obj);
        };
    }
};

dd.map.geo = {
    point: function(latProp, lonProp, keyProp) {
        var id = 0;
        return function(d, emit) {
            var key = keyProp ? d[keyProp] : id++;
            emit(key, dd.geo.Point(d[lonProp], d[latProp], d));
        };
    }
};

dd.emit.geo = {
    segments: function() {
        return function(key, data, emit) {
            var prev = null, cur = null;
            for (var i=0; i<data.length; i++) {
                cur = data[i];
                if (prev) {
                    emit(key + '-' + i, dd.geo.LineString([[prev.lon,prev.lat],[cur.lon,cur.lat]], prev));
                }
                prev = cur;
            }
        };
    }
};

// constructors for GeoJSON objects
dd.geo = {
    Point: function(lon, lat, properties) {
        return {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [lon, lat]
            },
            properties: properties
        };
    },
    LineString: function(coordinates, properties) {
        return {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: coordinates
            },
            properties: properties
        };
    }
};

function wildcards(spec) {
    spec = dd.toArray(spec);
    for (var i=0; i<spec.length; i++) {
        if (!(spec[i] instanceof RegExp)) {
            spec[i] = new RegExp('^' + spec[i].replace('*','.*').replace('?','.'));
        }
    }
    return spec;
}

// https://code.google.com/p/mapreduce-js/
// Mozilla Public License
dd.mapreduce = function (data, map, reduce) {
	var mapResult = [],
        reduceResult = dd.OrderedHash(),
        reduceKey;
	
    reduce = reduce || dd.emit.last(); // default
    
	var mapEmit = function(key, value) {
        if (key == null) return; // do not emit if key is null or undefined
		if(!mapResult[key]) {
			mapResult[key] = [];
		}
		mapResult[key].push(value);
	};
	
	var reduceEmit = function(key, value) {
		reduceResult.push(key, value);
	};
	
	for(var i = 0; i < data.length; i++) {
		map(data[i], mapEmit);
	}
	
	for(reduceKey in mapResult) {
		reduce(reduceKey, mapResult[reduceKey], reduceEmit);
	}
	
	return reduceResult;
};

dd.mapreducer = function(map, reduce) {
    return function(data) {
        dd.mapreduce(data, map, reduce);
    };
};
// Helper functions for map etc.

// put 'd' in another object using the attribute 'key'
// optional 'pull' is the name of a key to leave on the top level 
dd.envelope = function(key, pull, func) {
    return function(d) {
        if (pull && typeof pull == 'function') {
            // envelope(key, func) case
            func = pull;
            pull = null;
        }
        if (func) d = func(d);
        var val = {};
        val[key] = d;
        if (pull) {
            val[pull] = d[pull];
            delete d[pull];
        }
        return val;
    };
};
dd.prefix = function(prefix, func) {
    return function(d) {
    
        if (func) d = func(d);
    
        var val = {},
            keys = Object.keys(d);
            
        for (var i=0; i<keys.length; i++) {
            val[prefix + keys[i]] = d[keys[i]];
        }
            
        return val;
    };
};
dd.prefix_attr = function(attr, func) {
    return function(d) {
    
        if (func) d = func(d);
    
        var val = {},
            keys = Object.keys(d),
            prefix = d[attr] ? d[attr] + '_' : '';
            
        for (var i=0; i<keys.length; i++) {
            val[prefix + keys[i]] = d[keys[i]];
        }
            
        return val;
    };
};
dd.map_attr = function(map, func) {
    return function(d) {
    
        if (func) d = func(d);
    
        if (typeof map == 'function') {
            d = map(d);
        }
        else {
            var keys = Object.keys(map);
            for (var i=0; i<keys.length; i++) {
                var key = keys[i];
                var val = map[key];
                if (typeof val == 'function') {
                    d[key] = val(d);
                }
                else if (d[val]) {
                    d[key] = d[val];
                    delete d[val];
                }
            }
        }
            
        return d;
    };
};
dd.reverse = function(data) {
    if (data.slice && typeof data.slice == 'function') {
        // slice() = copy
        return data.slice().reverse(); 
    }
    return data;
};

module.exports = dd;

},{"d3-dsv":2,"fs":2}],2:[function(require,module,exports){

},{}],3:[function(require,module,exports){
/*! mapmap.js 0.2.8-dev.0 © 2014-2015 Florian Ledermann 

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

var dd = require('datadata');

var version = '0.2.8-dev.0';

function assert(test, message) { if (test) return; throw new Error("[mapmap] " + message);}
assert(window.d3, "d3.js is required!");
assert(window.Promise, "Promises not available in your browser - please add the necessary polyfill, as detailed in https://github.com/floledermann/mapmap.js#using-mapmapjs");

var default_settings = {
    locale: 'en',
    keepAspectRatio: true,
    placeholderClassName: 'placeholder',
    svgAttributes: {
        'overflow': 'hidden' // needed for IE
    },
    pathAttributes: {
        'fill': 'none',
        'stroke': '#000',
        'stroke-width': '0.2px',
        'stroke-linejoin': 'bevel',
        'pointer-events': 'none'
    },
    backgroundAttributes: {
        'width': '300%',
        'height': '300%',
        'fill': 'none',
        'stroke': 'none',
        'transform': 'translate(-800,-400)',
        'pointer-events': 'all'
    },
    overlayAttributes: {
        'fill': '#ffffff',
        'fill-opacity': '0.2',
        'stroke-width': '0.8',
        'stroke': '#333',
        'pointer-events': 'none'
    },
    defaultMetadata: {
        // domain:  is determined by data analysis
        scale: 'quantize',
        colors: ["#ffffcc","#c7e9b4","#7fcdbb","#41b6c4","#2c7fb8","#253494"], // Colorbrewer YlGnBu[6] 
        undefinedValue: "", //"undefined"
        //undefinedLabel: -> from locale
        undefinedColor: 'transparent'
    }
};

var mapmap = function(element, options) {
    // ensure constructor invocation
    if (!(this instanceof mapmap)) return new mapmap(element, options);

    this.settings = {};    
    this.options(mapmap.extend({}, default_settings, options));
    
    // promises
    this._promise = {
        geometry: null,
        data: null
    };

    this.selected = null;
    
    this.layers = new dd.OrderedHash();
    //this.identify_func = identify_layer;
    this.identify_func = identify_by_properties();
    
    this.metadata_specs = [];

    // convert seletor expression to node
    element = d3.select(element).node();
 
    // defaults
    this._projection = d3.geo.mercator().scale(1);
    
    this.initEngine(element);
    this.initEvents(element);
    
    this.dispatcher = d3.dispatch('choropleth','view','click','mousedown','mouseup','mousemove');
    
    return this;    
};

// expose datadata library in case we are bundled for browser
// (browserify doesn't support mutliple global exports)
mapmap.datadata = dd;

mapmap.prototype = {
	version: version
};

mapmap.extend = function extend(){
    for(var i=1; i<arguments.length; i++)
        for(var key in arguments[i])
            if(arguments[i].hasOwnProperty(key))
                arguments[0][key] = arguments[i][key];
    return arguments[0];
}

mapmap.prototype.initEngine = function(element) {
    // SVG specific initialization, for now we have no engine switching functionality
    
    // HTML elements, stored as d3 selections    
    var mainEl = d3.select(element).classed('mapmap', true),
        mapEl = mainEl.append('g').attr('class', 'map');
    
    mainEl.attr(this.settings.svgAttributes);
    
    this._elements = {
        main: mainEl,
        map: mapEl,
        parent: d3.select(mainEl.node().parentNode),
        // child elements
        defs: mainEl.insert('defs', '.map'),
        backgroundGeometry: mapEl.append('g').attr('class', 'background-geometry'),
        background: mapEl.append('rect').attr('class', 'background').attr(this.settings.backgroundAttributes),
        shadowGroup: mapEl.append('g'),
        geometry: mapEl.append('g').attr('class', 'geometry'),
        overlay: mapEl.append('g').attr('class', 'overlays'),
        fixed: mainEl.append('g').attr('class', 'fixed'),
        legend: mainEl.append('g').attr('class', 'legend'),
        placeholder: mainEl.select('.' + this.settings.placeholderClassName)
    };
    
    // set up width/height
    this.width = null;
    this.height = null;
    
    // TODO: use options.width || options.defaultWidth etc.
    if (!this.width) {
        this.width = parseInt(mainEl.attr('width')) || 800;
    }
    if (!this.height) {
        this.height = parseInt(mainEl.attr('height')) || 400;
    }
    var viewBox = mainEl.attr('viewBox');
    if (!viewBox) {
        mainEl.attr('viewBox', '0 0 ' + this.width + ' ' + this.height);
    }
    
    this._elements.defs.append('filter')
        .attr('id', 'shadow-glow')
        .append('feGaussianBlur')
        .attr('stdDeviation', 5);

    this._elements.defs.append('filter')
        .attr('id', 'light-glow')
        .append('feGaussianBlur')
        .attr('stdDeviation', 1);
    
    this._elements.shadowEl = this._elements.shadowGroup
        .append('g')
        .attr('class', 'shadow')
        .attr('filter', 'url(#shadow-glow)');
        
    this._elements.shadowCropEl = this._elements.shadowGroup
        .append('g')
        .attr('class', 'shadow-crop');
       
    this.supports = {};
    
    // feature detection
    var el = this._elements.main.append('path').attr({
        'paint-order': 'stroke',
        'vector-effect': 'non-scaling-stroke'
    });  
    
    var val = getComputedStyle(el.node()).getPropertyValue('paint-order');
    this.supports.paintOrder = val && val.indexOf('stroke') == 0;
    
    val = getComputedStyle(el.node()).getPropertyValue('vector-effect');
    this.supports.nonScalingStroke = val && val.indexOf('non-scaling-stroke') == 0;
    this._elements.main.classed('supports-non-scaling-stroke', this.supports.nonScalingStroke);
        
    el.remove();
    
    // compatibility settings
    if (navigator.userAgent.indexOf('MSIE') !== -1 || navigator.appVersion.indexOf('Trident/') > 0) {
        this.supports.hoverDomModification = false;
    }
    else {
        this.supports.hoverDomModification = true;
    }
    
    // Firefox < 35 will report wrong BoundingClientRect (adding clipped background),
    // https://bugzilla.mozilla.org/show_bug.cgi?id=530985
    var match = /Firefox\/(\d+)/.exec(navigator.userAgent);
    if (match && parseInt(match[1]) < 35) {
        this.supports.svgGetBoundingClientRect = false;
    }
    else {
        this.supports.svgGetBoundingClientRect = true;
    }
    
    var map = this;
    // save viewport state separately, as zoom may not have exact values (due to animation interpolation)
    this.current_scale = 1;
    this.current_translate = [0,0];
    
    this.zoom = d3.behavior.zoom()
        .translate([0, 0])
        .scale(1)
        .scaleExtent([1, 8])
        .on('zoom', function () {
            map.current_scale = d3.event.scale;
            map.current_translate = d3.event.translate;
            mapEl.attr('transform', 'translate(' + d3.event.translate + ')scale(' + d3.event.scale + ')');
            if (!map.supports.nonScalingStroke) {
                //map._elements.geometry.selectAll("path").style("stroke-width", 1.5 / d3.event.scale + "px");
            }
        });

    mapEl
        //.call(this.zoom) // free mousewheel zooming
        .call(this.zoom.event);
      /*  
    var drag = d3.behavior.drag()
        .origin(function() {return {x:map.current_translate[0],y:map.current_translate[1]};})
        .on('dragstart', function() {
            d3.event.sourceEvent.stopPropagation(); 
        })
        .on('dragend', function() {
            d3.event.sourceEvent.stopPropagation(); 
        })
        .on('drag', function() {
            map.current_translate = [d3.event.x, d3.event.y];
            mapEl.attr('transform', 'translate(' + d3.event.x + ',' + d3.event.y + ')scale(' + map.current_scale + ')');
        })
    ;*/
        
    //mapEl.call(drag);
    
    
    var map = this;
    
    function constructEvent(event) {
        // TODO: maybe this should be offsetX/Y, but then we need to change
        // zoomToViewportPosition to support click-to-zoom
        var pos = [event.clientX, event.clientY]
        return {
            position: pos,
            location: map._projection.invert(pos),
            event: event
        }
    };

    mapEl.on('click', function() {
        // TODO: check if anyone is listening, else return immediately
        map.dispatcher.click.call(map, constructEvent(d3.event));
    });

    mapEl.on('mousedown', function() {
        // TODO: check if anyone is listening, else return immediately
        map.dispatcher.mousedown.call(map, constructEvent(d3.event));
    });

    mapEl.on('mouseup', function() {
        // TODO: check if anyone is listening, else return immediately
        map.dispatcher.mousedown.call(map, constructEvent(d3.event));
    });

    mapEl.on('mousemove', function() {
        // TODO: check if anyone is listening, else return immediately
        map.dispatcher.mousedown.call(map, constructEvent(d3.event));
    });

};

mapmap.prototype.initEvents = function(element) {
    var map = this;
    // keep aspect ratio on resize
    function resize() {
    
        map.bounds = map.getBoundingClientRect();
        
        if (map.settings.keepAspectRatio) {
            var width = element.getAttribute('width'),
                height = element.getAttribute('height');
            if (width && height && map.bounds.width) {
                var ratio = width / height;
                element.style.height = (map.bounds.width / ratio) + 'px';
            }
        }
    }
    
    window.onresize = resize;
    
    resize();
};

var domain = [0,1];

var layer_counter = 0;

// TODO: think about caching loaded resources (#8)
mapmap.prototype.geometry = function(spec, keyOrOptions) {

    // key is default option
    var options = dd.isString(keyOrOptions) ? {key: keyOrOptions} : keyOrOptions;

    options = dd.merge({
        key: 'id',
        setExtent: true
        // layers: taken from input or auto-generated layer name
    }, options);

    var map = this;
    
    if (dd.isFunction(spec)) {
        this._promise.geometry.then(function(topo){
            var new_topo = spec(topo);
            if (typeof new_topo.length == 'undefined') {
                new_topo = [new_topo];
            }
            new_topo.map(function(t) {
                if (typeof t.geometry.length == 'undefined') {
                    t.geometry = [t.geometry];
                }
                if (typeof t.index == 'undefined') {
                    map.layers.push(t.name, t.geometry);
                }
                else {
                    map.layers.insert(t.index, t.name, t.geometry);
                }
            });
            if (options.setExtent) {
                if (!map.selected_extent) {
                    map._extent(spec);           
                }
                map.draw();
                if (options.ondraw) options.ondraw();
            }
        });
        return this;
    }

    if (dd.isDictionary(spec)) {
        if (!options.layers) {
            options.layers = 'layer-' + layer_counter++;
        }
        
        spec = [{type:'Feature',geometry:spec}];

        map.layers.push(options.layers, spec);
        // add dummy promise, we are not loading anything
        var promise = new Promise(function(resolve, reject) {
            resolve(spec);
        });
        this.promise_data(promise);
        // set up projection first to avoid reprojecting geometry
        // TODO: setExtent options should be decoupled from drawing,
        // we need a way to defer both until drawing on last geom promise works
        if (options.setExtent) {
            if (!map.selected_extent) {
                map._extent(spec);           
            }
            map.draw();
            if (options.ondraw) options.ondraw();
        }
        return this;
    }

    if (dd.isArray(spec)) {
        // Array case
        var new_topo = dd.mapreduce(spec, options.map, options.reduce);
        if (!options.layers) {
            options.layers = 'layer-' + layer_counter++;
        }
        map.layers.push(options.layers, new_topo.values());
        // add dummy promise, we are not loading anything
        var promise = new Promise(function(resolve, reject) {
            resolve(new_topo);
        });
        this.promise_data(promise);
        // set up projection first to avoid reprojecting geometry
        if (options.setExtent) {
            if (!map.selected_extent) {
                map._extent(new_topo.values());           
            }
            // TODO: we need a smarter way of setting up projection/bounding box initially
            // if extent() was called, this should have set up bounds, else we need to do it here
            // however, extent() currently operates on the rendered <path>s generated by draw()
            // Also: draw should be called only at end of promise chain, not inbetween!
            //this._promise.geometry.then(draw);
            map.draw();
            if (options.ondraw) options.ondraw();
        }
        return this;
    }

    var promise = dd.load(spec);

    // chain to existing geometry promise
    if (this._promise.geometry) {
        var parent = this._promise.geometry;
        this._promise.geometry = new Promise(function(resolve, reject) {
            parent.then(function(_) {
                promise.then(function(data) {
                    resolve(data);
                });
            });
        });
    }
    else {
        this._promise.geometry = promise;
    }
    
    this._promise.geometry.then(function(geom) {
        if (geom.type && geom.type == 'Topology') {
            // TopoJSON
            var keys = options.layers || Object.keys(geom.objects);
            keys.map(function(k) {
                if (geom.objects[k]) {
                    var objs = topojson.feature(geom, geom.objects[k]).features;
                    map.layers.push(k, objs);
					// TODO: support functions for map as well as strings
                    if (options.key) {
                        for (var i=0; i<objs.length; i++) {
                            var obj = objs[i];
                            if (obj.properties && obj.properties[options.key]) {
                                objs[i].properties.__key__ = obj.properties[options.key];
                            }
                        }
                    }
                }
            });
        }
        else {
            // GeoJSON
            if (!options.layers) {
                options.layers = 'layer-' + layer_counter++;
            }
            if (geom.features) {
                map.layers.push(options.layers, geom.features);
            }
            else {
                map.layers.push(options.layers, [geom]);
            }
        }
        // set up projection first to avoid reprojecting geometry
        if (options.setExtent) {
            if (!map.selected_extent) {
                map._extent(geom);           
            }
        }
        // TODO: we need a smarter way of setting up projection/bounding box initially
        // if extent() was called, this should have set up bounds, else we need to do it here
        // however, extent() currently operates on the rendered <path>s generated by draw()
        //this._promise.geometry.then(draw);
        map.draw();
        if (options.ondraw) options.ondraw();
    });
    
    // put into chained data promise to make sure is loaded before later data
    // note this has to happen after merging into this._promise.geometry to make
    // sure layers are created first (e.g. for highlighting)
    this.promise_data(promise);
 
    return this;
};

var identify_by_properties = function(properties){
    // TODO: calling this without properties should use primary key as property
    // however, this is not stored in the object's properties currently
    // so there is no easy way to access it
    if (!properties) {
        properties = '__key__';
    }
    // single string case
    if (properties.substr) {
        properties = [properties];
    }
    return function(layers, name){
        name = name.toString().toLowerCase();
        // layers have priority, so iterate them first
        var lyr = layers.get(name);
        if (lyr) return lyr;
        var result = [];
        // properties are ordered by relevance, so iterate these first
        for (var k=0; k<properties.length; k++) {
            var property = properties[k];
            for (var i=0; i<layers.length(); i++) {
                var key = layers.keys()[i],
                    geoms = layers.get(key);
                for (var j=0; j<geoms.length; j++) {
                    var geom = geoms[j];
                    if (geom.properties && geom.properties[property] !== undefined && geom.properties[property].toString().toLowerCase() == name) {
                        result.push(geom);
                    }
                }
            }
        }
        return result;
    };
};

var identify_layer = function(layers, name) {
    name = name.toLowerCase();
    return layers.get(name);
};

// TODO: use all arguments to identify - can be used to provide multiple properties or functions
mapmap.prototype.identify = function(spec) {
    if (typeof spec == 'function') {
        this.identify_func = spec;
        return this;
    }
    // cast to array
    if (!spec.slice) {
        spec = [spec];
    }
    this.identify_func = identify_by_properties(spec);
    return this;
};

mapmap.prototype.searchAdapter = function(selection, propName) {
    var map = this;
    return function(query, callback) {
        map.promise_data().then(function() {
            var sel = map.getRepresentations(selection),
                results = [];
            sel = sel[0];
            for (var i=0; i<sel.length; i++) {
                var d = sel[i].__data__.properties;
                if (d[propName] && d[propName].toLowerCase().indexOf(query.toLowerCase()) == 0) {
                    results.push(sel[i].__data__);
                }
            }
            callback(results);
        });
    };
};

// TODO: this is needed for search functionality (see tools.js) - generalize and integrate
// into identify() etc.
mapmap.prototype.search = function(value, key) {
    key = key || '__key__';
    return identify_by_properties([key])(this.layers, value);
};

// return the representation (= SVG element) of a given object
mapmap.prototype.repr = function(d) {
    return d.__repr__;
};


mapmap.prototype.draw = function() {

    var groupSel = this._elements.geometry
        .selectAll('g')
        .data(this.layers.keys(), function(d,i) { return d; });
    
    var map = this;
    
    var pathGenerator = d3.geo.path().projection(this._projection);

    if (this._elements.placeholder) {
        this._elements.placeholder.remove();
        this._elements.placeholder = null;
    }
    
    groupSel.enter()
        .append('g')
        .attr('class', function(d){
            return d;
        })
        .each(function(d) {
            // d is name of topology object
            var geom = map.layers.get(d);
            var geomSel = d3.select(this)
                .selectAll('path')
                .data(geom);
                        
            geomSel
                .enter()
                .append('path')
                .attr('d', pathGenerator)
                .attr(map.settings.pathAttributes)
                .each(function(d) {
                    // link data object to its representation
                    d.__repr__ = this;
                });
        });
    
    groupSel.order();
};

mapmap.prototype.anchorFunction = function(f) {
    this.anchorF = f;
    return this;
};

mapmap.prototype.anchor = function(d) {
    if (this.anchorF) {
        return this.anchorF(d);
    }
};

mapmap.prototype.size = function() {
    // bounds are re-calculate by initEvents on every resize
    return {
        width: this.width,
        height: this.height
    };
};


mapmap.prototype.getBoundingClientRect = function() {

    var el = this._elements.main.node(),
        bounds = el.getBoundingClientRect();
    
    if (this.supports.svgGetBoundingClientRect) {
        return bounds;
    }
        
    // Fix getBoundingClientRect() for Firefox < 35
    // https://bugzilla.mozilla.org/show_bug.cgi?id=530985
    // http://stackoverflow.com/questions/23684821/calculate-size-of-svg-element-in-html-page
    var cs = getComputedStyle(el),
        parentOffset = el.parentNode.getBoundingClientRect(),
        left = parentOffset.left,
        scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0,
        scrollLeft = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0
    ;
    // TODO: take into account margins etc.
    if (cs.left.indexOf('px') > -1) {
        left += parseInt(cs.left.slice(0,-2));
    }
    // this tests getBoundingClientRect() to be non-buggy
    if (bounds.left == left - scrollLeft) {
        return bounds;
    }
    // construct synthetic boundingbox from computed style
    var top = parentOffset.top,
        width = parseInt(cs.width.slice(0,-2)),
        height = parseInt(cs.height.slice(0,-2));
    return {
        left: left - scrollLeft,
        top: top - scrollTop,
        width: width,
        height: height,
        right: left + width - scrollLeft,
        bottom: top + height - scrollTop
    };
};

// TODO: disable pointer-events for not selected paths
mapmap.prototype.select = function(selection) {

    var map = this;
    
    function getName(sel) {
        return (typeof sel == 'string') ? sel : (sel.selectionName || 'function');
    }
    var oldSel = this.selected;
    if (this.selected) {
        this._elements.main.classed('selected-' + getName(this.selected), false);
    }
    this.selected = selection;
    if (this.selected) {
        this._elements.main.classed('selected-' + getName(this.selected), true);
    }
    this.promise_data().then(function(){
        if (oldSel) {
            map.getRepresentations(oldSel).classed('selected',false);
        }
        if (selection) {
            map.getRepresentations(selection).classed('selected',true);
        }
    });
    return this;
};

mapmap.prototype.highlight = function(selection) {

    var map = this;
       
    if (selection === null) {
        map._elements.shadowEl.selectAll('path').remove();
        map._elements.shadowCropEl.selectAll('path').remove();
    }
    else {
        this.promise_data().then(function(data) {      
            var obj = map.getRepresentations(selection);
            map._elements.shadowEl.selectAll('path').remove();
            map._elements.shadowCropEl.selectAll('path').remove();
            obj.each(function() {
                map._elements.shadowEl.append('path')
                    .attr({
                        d: this.attributes.d.value,
                        fill: 'rgba(0,0,0,0.5)' //'#999'
                    });
                map._elements.shadowCropEl.append('path')
                    .attr({
                        d: this.attributes.d.value,
                        fill: '#fff'
                    });
            });
        });
    }
    return this;
};

/*
Call without parameters to get current selection.
Call with null to get all topology objects.
Call with function to filter geometries.
Call with string to filter geometries/layers based on identify().
Call with geometry to convert into d3 selection.

Returns a D3 selection.
*/
mapmap.prototype.getRepresentations = function(selection) {
    if (typeof selection == 'undefined') {
        selection = this.selected;
    }
    if (selection) {
        if (typeof selection == 'function') {
            return this._elements.geometry.selectAll('path').filter(function(d,i){
                return selection(d.properties);
            });
        }
        if (selection.__data__) {
            // is a geometry generated by d3 -> return selection
            return d3.select(selection);
        }
        // TODO: this should have a nicer API
        var obj = this.identify_func(this.layers, selection);
        if (!obj) return d3.select(null);
        // layer case
        if (obj.length) {
            return d3.selectAll(obj.map(function(d){return d.__repr__;}));
        }
        // object case
        return d3.select(obj.__repr__);
    }
    return this._elements.geometry.selectAll('path');
};

// TODO: this is an ugly hack for now, until we properly keep track of current merged data!
mapmap.prototype.getData = function(key, selection) {

    var map = this;
    
    return new Promise(function(resolve, reject) {
        map._promise.data.then(function(data) {
        
            data = dd.OrderedHash();
            
            map.getRepresentations(selection)[0].forEach(function(d){
                if (typeof d.__data__.properties[key] != 'undefined') {
                    data.push(d.__data__.properties[key], d.__data__.properties);
                }
            });
            
            resolve(data);
        });
    });
};

mapmap.prototype.getOverlayContext = function() {
    return this._elements.overlay;
};

mapmap.prototype.project = function(point) {
    return this._projection(point);
};


mapmap.prototype.promise_data = function(promise) {
    // chain a new promise to the data promise
    // this allows a more elegant API than Promise.all([promises])
    // since we use only a single promise the "encapsulates" the
    // previous ones
    
    // TODO: hide this._promise.data through a closure?
    
    // TODO: we only fulfill with most recent data - should
    // we not *always* fulfill with canonical data i.e. the
    // underlying selection, or keep canonical data and refresh
    // selection always?
    // Also, we need to keep data that has no entities in the geometry
    // e.g. for loading stats of aggregated entities. We could
    // use a global array of GeoJSON features, as this allows
    // either geometry or properties to be null -- fl 2015-11-21

    var map = this;
    
    if (promise) {
        if (this._promise.data) {
            this._promise.data = new Promise(function(resolve, reject) {
                map._promise.data.then(function(_) {
                    promise.then(function(data) {
                        resolve(data);
                    });
                });
            });
        }
        else {
            this._promise.data = promise;
        }
    }
    return this._promise.data;   
};

mapmap.prototype.then = function(callback) {
    this.promise_data().then(callback);
    return this;
};

// TODO: think about caching loaded resources (#8)
mapmap.prototype.data = function(spec, keyOrOptions) {

    var options = dd.isDictionary(keyOrOptions) ? keyOrOptions : {map: keyOrOptions};
    
    options = dd.merge({
        geometryKey: '__key__' // natural key
        // map: datdata default
        // reduce: datdata default
    }, options);
        
    var map = this;
    
    if (typeof spec == 'function') {
        this.promise_data().then(function(data){
            // TODO: this is a mess, see above - data
            // doesn't contain the actual canonical data, but 
            // only the most recently requested one, which doesn't
            // help us for transformations
            map._elements.geometry.selectAll('path')
            .each(function(geom) {
                if (geom.properties) {
                    var val = spec(geom.properties);
                    if (val) {
                        mapmap.extend(geom.properties, val);
                    }
                }
            });
        });
    }
    else {
        this.promise_data(dd(spec, options.map, options.reduce, options))
        .then(function(data) {
            if (data.length() == 0) {
                console.warn("Data for key '" + options.map + "' yielded no results!");
            }
            map._elements.geometry.selectAll('path')
                .each(function(d) {
                    if (d.properties) {
                        var k = d.properties[options.geometryKey];
                        if (k) {
                            mapmap.extend(d.properties, data.get(k));
                        }
                        else {
                            //console.warn("Key '" + options.geometryKey + "' not found in " + this + "!");
                        }    
                    }
                });
        });
    }
    return this;
};

var MetaDataSpec = function(key, fields) {
    // ensure constructor invocation
    if (!(this instanceof MetaDataSpec)) return new MetaDataSpec(key, fields);
    mapmap.extend(this, fields);
    this.key = key;
    return this;
};
MetaDataSpec.prototype.specificity = function() {
    // regex case. use length of string representation without enclosing /.../
    if (this.key instanceof RegExp) return this.key.toString()-2;
    // return number of significant letters
    return this.key.length - (this.key.match(/[\*\?]/g) || []).length;
};
MetaDataSpec.prototype.match = function(str) {
    if (this.key instanceof RegExp) return (str.search(this.key) == 0);
    var rex = new RegExp('^' + this.key.replace('*','.*').replace('?','.'));
    return (str.search(rex) == 0);
};
var MetaData = function(fields, localeProvider) {
    // ensure constructor invocation
    if (!(this instanceof MetaData)) return new MetaData(fields, localeProvider);
    mapmap.extend(this, fields);
    // take default from locale
    if (!this.undefinedLabel) this.undefinedLabel = localeProvider.locale.undefinedLabel;
    
    this.format = function(val) {
        if (!this._format) {
            this._format = this.getFormatter();
        }
        // return undefined if undefined or if not a number but number formatting explicitly requested
        if (val === undefined || val === null || (this.numberFormat && (isNaN(val)))) {
            return this.undefinedValue;
        }
        return this._format(val);
    };
    this.getFormatter = function() {
        if (this.scale == 'ordinal' && this.valueLabels) {
            var scale = d3.scale.ordinal().domain(this.domain).range(this.valueLabels);
            return scale;
        }
        if (this.numberFormat && typeof this.numberFormat == 'function') {
            return this.numberFormat;
        }
        if (localeProvider.locale) {
            return localeProvider.locale.numberFormat(this.numberFormat || '.01f');
        }
        return d3.format(this.numberFormat || '.01f');
    };
    this.getRangeFormatter = function() {
        var fmt = this.format.bind(this);
        return function(lower, upper, excludeLower, excludeUpper) {
            if (localeProvider.locale && localeProvider.locale.rangeLabel) {
                return localeProvider.locale.rangeLabel(lower, upper, fmt, excludeLower, excludeUpper);
            }
            return defaultRangeLabel(lower, upper, fmt, excludeLower, excludeUpper);
        }
    };
    return this;
};

mapmap.prototype.meta = function(metadata){
    var keys = Object.keys(metadata);
    for (var i=0; i<keys.length; i++) {
        this.metadata_specs.push(MetaDataSpec(keys[i], metadata[keys[i]]));
    }
    this.metadata_specs.sort(function(a,b) {
        return a.specificity()-b.specificity();
    });
    return this;
};

mapmap.prototype.getMetadata = function(key) {
    if (!this.metadata) {
        this.metadata = {};
    }
    if (!this.metadata[key]) {
        var fields = mapmap.extend({}, this.settings.defaultMetadata);
        for (var i=0; i<this.metadata_specs.length; i++) {
            if (this.metadata_specs[i].match(key)) {
                mapmap.extend(fields, this.metadata_specs[i]);
            }
        }
        this.metadata[key] = MetaData(fields, this);
    }
    return this.metadata[key];
};

function getStats(data, valueFunc) {
    var stats = {
        count: 0,
        countNumbers: 0,
        anyNegative: false,
        anyPositive: false,
        anyStrings: false,
        min: undefined,
        max: undefined
    };
    function datumFunc(d) {
        var val = valueFunc(d);
        if (val !== undefined) {
            stats.count += 1;
            if (dd.isNumeric(val)) {
                val = +val;
                stats.countNumbers += 1;
                if (stats.min === undefined) stats.min = val;
                if (stats.max === undefined) stats.max = val;
                if (val < stats.min) stats.min = val;
                if (val > stats.max) stats.max = val;
                if (val > 0) stats.anyPositive = true;
                if (val < 0) stats.anyNegative = true;
            }
            else if (val) {
                stats.anyString = true;
            }
        }
    }
    if (data.each && typeof data.each == 'function') {
        data.each(datumFunc);
    }
    else {
        for (var i=0; i<data.length; i++) {
            datumFunc(data[i]);
        }
    }
    return stats;
}

function properties_accessor(func) {
    // converts a data callback function to access data's .properties entry
    // useful for processing geojson objects
    return function(data) {
        if (data.properties) return func(data.properties);
    };
}

mapmap.prototype.autoColorScale = function(value, metadata, selection) {
    
    if (!metadata) {
        metadata = this.getMetadata(value);
    }
    else {
        metadata = dd.merge(this.settings.defaultMetadata, metadata);
    }
    
    if (!metadata.domain) {
        var stats = getStats(this.getRepresentations(selection), properties_accessor(keyOrCallback(value)));
        
        if (stats.anyNegative && stats.anyPositive) {
            // make symmetrical
            metadata.domain = [Math.min(stats.min, -stats.max), Math.max(stats.max, -stats.min)];
        }
        else {
            metadata.domain = [stats.min,stats.max];
        }
    }
    // support d3 scales out of the box
    var scale = d3.scale[metadata.scale]();
    scale.domain(metadata.domain).range(metadata.color || metadata.colors)
    
    if (metadata.scale == 'ordinal' && !scale.invert) {
        // d3 ordinal scales don't provide invert method, so patch one here
        // https://github.com/mbostock/d3/pull/598
        scale.invert = function(x) {
            var i = scale.range().indexOf(x);
            return (i > -1) ? metadata.domain[i] : null;
        }
    }
    
    return scale;    
};

mapmap.prototype.autoLinearScale = function(valueFunc) {    
    var stats = getStats(this._elements.geometry.selectAll('path'), properties_accessor(valueFunc));    
    return d3.scale.linear()
        .domain([0,stats.max]);    
};
mapmap.prototype.autoSqrtScale = function(valueFunc) {    
    var stats = getStats(this._elements.geometry.selectAll('path'), properties_accessor(valueFunc));    
    return d3.scale.sqrt()
        .domain([0,stats.max]);    
};

mapmap.prototype.attr = function(spec, selection) {
    this.symbolize(function(repr) {
        repr.attr(spec);
    }, selection);
    return this;
}

// TODO: right now, symbolize doesn't seem to be any different from applyBehavior!
// either this should be unified, or the distinctions clearly worked out
mapmap.prototype.symbolize = function(callback, selection, finalize) {

    var map = this;
    
    // store in closure for later access
    selection = selection || this.selected;
    this.promise_data().then(function(data) {      
        map.getRepresentations(selection)
            .each(function(geom) {
                callback.call(map, d3.select(this), geom, geom.properties);
            });
        if (finalize) finalize.call(map);
    });
    return this;
};

mapmap.prototype.symbolizeAttribute = function(attribute, reprAttribute, metaAttribute, selection) {

    metaAttribute = metaAttribute || reprAttribute;
    
    selection = selection || this.selected;
    
    var map = this;
    
    this.promise_data().then(function(data) {      

        var metadata = map.getMetadata(attribute);

        var scale = d3.scale[metadata.scale]();
        scale.domain(metadata.domain).range(metadata[metaAttribute]);

        map.symbolize(function(el, geom, data) {
            el.attr(reprAttribute, scale(data[attribute]));
        }, selection);

        map.updateLegend(attribute, reprAttribute, metadata, scale, selection);
    });
    
    return this;
    
}


// TODO: improve handling of using a function here vs. using a named property
// probably needs a unified mechanism to deal with property/func to be used elsewhere
mapmap.prototype.choropleth = function(spec, metadata, selection) {    
    // we have to remember the scale for legend()
    var colorScale = null,
        valueFunc = keyOrCallback(spec),
        map = this;
        
    function color(el, geom, data) {
        if (spec === null) {
            // clear
            el.attr('fill', this.settings.pathAttributes.fill);
            return;
        }
        // on first call, set up scale & legend
        if (!colorScale) {
            // TODO: improve handling of things that need the data, but should be performed
            // only once. Should we provide a separate callback for this, or use the 
            // promise_data().then() for setup? As this could be considered a public API usecase,
            // maybe using promises is a bit steep for outside users?
            if (typeof metadata == 'string') {
                metadata = this.getMetadata(metadata);
            }
            if (!metadata) {
                metadata = this.getMetadata(spec);
            }
            colorScale = this.autoColorScale(spec, metadata, selection);
            this.updateLegend(spec, 'fill', metadata, colorScale, selection);
        }
        if (el.attr('fill') != 'none') {
            // transition if color already set
            el = el.transition();
        }
        el.attr('fill', function(geom) {           
            var val = valueFunc(geom.properties);
            // check if value is undefined or null
            if (val == null || (metadata.scale != 'ordinal' && isNaN(val))) {
                return metadata.undefinedColor || map.settings.pathAttributes.fill;
            }
            return colorScale(val) || map.settings.pathAttributes.fill;
        });
    }
    
    this.symbolize(color, selection, function(){
        this.dispatcher.choropleth.call(this, spec);
    });
        
    return this;
};

// TODO: this hsould be easily implemented using symbolizeAttribute and removed
mapmap.prototype.strokeColor = function(spec, metadata, selection) {    
    // we have to remember the scale for legend()
    var colorScale = null,
        valueFunc = keyOrCallback(spec),
        map = this;
        
    function color(el, geom, data) {
        if (spec === null) {
            // clear
            el.attr('stroke', this.settings.pathAttributes.stroke);
            return;
        }
        // on first call, set up scale & legend
        if (!colorScale) {
            // TODO: improve handling of things that need the data, but should be performed
            // only once. Should we provide a separate callback for this, or use the 
            // promise_data().then() for setup? As this could be considered a public API usecase,
            // maybe using promises is a bit steep for outside users?
            if (typeof metadata == 'string') {
                metadata = this.getMetadata(metadata);
            }
            if (!metadata) {
                metadata = this.getMetadata(spec);
            }
            colorScale = this.autoColorScale(spec, metadata, selection);
            this.updateLegend(spec, 'strokeColor', metadata, colorScale, selection);
        }
        if (el.attr('stroke') != 'none') {
            // transition if color already set
            el = el.transition();
        }
        el.attr('stroke', function(geom) {           
            var val = valueFunc(geom.properties);
            // check if value is undefined or null
            if (val == null || (metadata.scale != 'ordinal' && isNaN(val))) {
                return metadata.undefinedColor || map.settings.pathAttributes.stroke;
            }
            return colorScale(val) || map.settings.pathAttributes.stroke;
        });
    }
    
    this.symbolize(color, selection);
        
    return this;
};

// TODO: should we even have this, or put viz. techniques in a separate project/namespace?
mapmap.prototype.proportional_circles = function(value, scale) {
    
    var valueFunc = keyOrCallback(value);

    var pathGenerator = d3.geo.path().projection(this._projection);    
    
    scale = scale || 20;
    
    this.symbolize(function(el, geom, data) {
        if (value === null) {
            this._elements.overlay.select('circle').remove();
        }
        else if (geom.properties && typeof valueFunc(geom.properties) != 'undefined') {
            // if scale is not set, calculate scale on first call
            if (typeof scale != 'function') {
                scale = this.autoSqrtScale(valueFunc).range([0,scale]);
            }
            var centroid = pathGenerator.centroid(geom);
            this._elements.overlay.append('circle')
                .attr(this.settings.overlayAttributes)
                .attr({
                    r: scale(valueFunc(geom.properties)),
                    cx: centroid[0],
                    cy: centroid[1]
                });
        }
    });
    return this;
};

mapmap.symbolize = {};

mapmap.symbolize.addLabel = function(spec) {

    var valueFunc = keyOrCallback(spec);
        
    var pathGenerator = d3.geo.path();    

    return function(el, geom, data) {
        // lazy initialization of projection
        // we dont't have access to the map above, and also projection
        // may not have been initialized correctly
        if (pathGenerator.projection() !== this._projection) {
            pathGenerator.projection(this._projection);
        }

        // TODO: how to properly remove symbolizations?
        if (spec === null) {
            this._elements.overlay.select('circle').remove();
            return;
        }
        
        if (geom.properties && typeof valueFunc(geom.properties) != 'undefined') {
            var centroid = pathGenerator.centroid(geom);
            this._elements.overlay.append('text')
                .text(valueFunc(geom.properties))
                .attr({
                    stroke: '#ffffff',
                    fill: '#000000',
                    'font-size': 9,
                    'paint-order': 'stroke fill',
                    'alignment-baseline': 'middle',
                    dx: 7,
                    dy: 1
                })
                .attr({                    
                    x: centroid[0],
                    y: centroid[1]
                })
            ;
        }
    }
}

function addOptionalElement(elementName) {
    return function(value) {
        var valueFunc = keyOrCallback(value);
        this.symbolize(function(el, d) {  
            if (value === null) {
                el.select(elementName).remove();
                return;
            }
            el.append(elementName)
                .text(valueFunc(d.properties));
        });
        return this;
    };
}

mapmap.prototype.title = addOptionalElement('title');
mapmap.prototype.desc = addOptionalElement('desc');

var center = {
    x: 0.5,
    y: 0.5
};

mapmap.prototype.center = function(center_x, center_y) {
    center.x = center_x;
    if (typeof center_y != 'undefined') {
        center.y = center_y;
    }
    return this;
};
// store all hover out callbacks here, this will be called on zoom
var hoverOutCallbacks = [];

function callHoverOut() {
    for (var i=0; i<hoverOutCallbacks.length; i++) {
        hoverOutCallbacks[i]();
    }
}

var mouseover = null;

mapmap.showHover = function(el) {
    if (mouseover) {
        mouseover.call(el, el.__data__);
    }
};

mapmap.prototype.getAnchorForRepr = function(event, repr, options) {

    options = dd.merge({
        clipToViewport: true,
        clipMargins: {top: 40, left: 40, bottom: 0, right: 40}
    }, options);
    
    var bounds = repr.getBoundingClientRect();
    var pt = this._elements.main.node().createSVGPoint();
    
    pt.x = (bounds.left + bounds.right) / 2;
    pt.y = bounds.top;
    
    var mapBounds = this.getBoundingClientRect();
    
    if (options.clipToViewport) {  
        if (pt.x < mapBounds.left + options.clipMargins.left) pt.x = mapBounds.left + options.clipMargins.left;
        if (pt.x > mapBounds.right - options.clipMargins.right) pt.x = mapBounds.right - options.clipMargins.right;
        if (pt.y < mapBounds.top + options.clipMargins.top) pt.y = mapBounds.top + options.clipMargins.top;
        if (pt.y > mapBounds.bottom - options.clipMargins.bottom) pt.y = mapBounds.bottom - options.clipMargins.bottom;
    }
    pt.x -= mapBounds.left;
    pt.y -= mapBounds.top;

    return pt;
}

mapmap.prototype.getAnchorForMousePosition = function(event, repr, options) {
     
    options = dd.merge({
        anchorOffset: [0,-20]
     }, options);

     // http://www.jacklmoore.com/notes/mouse-position/
     var offsetX = event.layerX || event.offsetX,
         offsetY = event.layerY || event.offsetY;
    
    return {
        x: offsetX + options.anchorOffset[0],
        y: offsetY + options.anchorOffset[1]
    }
}


mapmap.prototype.hover = function(overCB, outCB, options) {

    options = dd.merge({
        moveToFront: true,
        clipToViewport: true,
        clipMargins: {top: 40, left: 40, bottom: 0, right: 40},
        selection: null,
        anchorPosition: this.getAnchorForRepr
     }, options);
    
    var map = this;
    
    if (!this._oldPointerEvents) {
        this._oldPointerEvents = [];
    }
    
    this.promise_data().then(function() {
        var obj = map.getRepresentations(options.selection);
        mouseover = function(d) {
            // "this" is the element, not the map!
            // move to top = end of parent node
            // this screws up IE event handling!
            if (options.moveToFront && map.supports.hoverDomModification) {
                // TODO: this should be solved via a second element to be placed in front!
                this.__hoverinsertposition__ = this.nextSibling;
                this.parentNode.appendChild(this);
            }
            
            var el = this,
                event = d3.event;
            
            // In Firefox the event positions are not populated properly in some cases
            // Defer call to allow browser to populate the event
            window.setTimeout(function(){
                var anchor = options.anchorPosition.call(map, event, el, options);           
                overCB.call(map, d.properties, anchor, el);   
            }, 10);
        };
        // reset previously overridden pointer events
        for (var i=0; i<map._oldPointerEvents.length; i++) {
            var pair = map._oldPointerEvents[i];
            pair[0].style('pointer-events', pair[1]);
        }
        map._oldPointerEvents = [];
        if (overCB) {
            obj
                .on('mouseover', mouseover)
                .each(function(){
                    // TODO: not sure if this is the best idea, but we need to make sure
                    // to receive pointer events even if css disables them. This has to work
                    // even for complex (function-based) selections, so we cannot use containment
                    // selectors (e.g. .selected-foo .foo) for this...
                    // https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/pointer-events
                    var sel = d3.select(this);
                    map._oldPointerEvents.push([sel, sel.style('pointer-events')]);
                    // TODO: this should be configurable via options
                    //sel.style('pointer-events','all');
                    sel.style('pointer-events','visiblePainted');
                })
            ;
        }
        else {
            obj.on('mouseover', null);
        }
        if (outCB) {
            obj.on('mouseout', function() {
                if (this.__hoverinsertposition__) {
                    this.parentNode.insertBefore(this, this.__hoverinsertposition__);
                }
                if (outCB) outCB();
            });
            hoverOutCallbacks.push(outCB);
        }
        else {
            obj.on('mouseout', null);
        }          
    });
    return this;
};

mapmap.prototype.formatValue = function(d, attr) {
    var meta = this.getMetadata(attr),
        val = meta.format(d[attr]);
    if (val == 'NaN') val = d[attr];
    return val;
};

mapmap.prototype.buildHTMLFunc = function(spec) {
    // function case
    if (typeof spec == 'function') return spec;
    // string case
    if (spec.substr) spec = [spec];
    
    var map = this;
    
    var func = function(d) {
        var html = "",
            pre, post;
        for (var i=0; i<spec.length; i++) {
            var part = spec[i];
            if (part) {
                pre = (i==0) ? '<b>' : '';
                post = (i==0) ? '</b><br>' : '<br>';
                if (typeof part == 'function') {
                    var str = part.call(map, d);
                    if (str) {
                        html += pre + str + post;
                    }
                    continue;
                }
                var meta = map.getMetadata(part);
                var prefix = meta.hoverLabel || meta.valueLabel || meta.label || '';
                if (prefix) prefix += ": ";
                var val = meta.format(d[part]);
                if (val == 'NaN') val = d[part];
                // TODO: make option "ignoreUndefined" etc.
                if (val !== undefined && val !== meta.undefinedValue) {
                    html += pre + prefix + val + ( meta.valueUnit ? ' ' + meta.valueUnit : '') + post;
                }
                else if (meta.undefinedLabel) {
                    html += pre + prefix + meta.undefinedLabel + post;
                }
            }
        }
        return html;
    };
    
    return func;
};

mapmap.prototype.hoverInfo = function(spec, options) {

    options = dd.merge({
        selection: null,
        hoverClassName: 'hoverInfo',
        hoverStyle: {
            position: 'absolute',
            padding: '0.5em 0.7em',
            'background-color': 'rgba(255,255,255,0.85)'
        },
        hoverEnterStyle: {
            display: 'block'
        },
        hoverLeaveStyle: {
            display: 'none'
        }
    }, options);
    
    var hoverEl = this._elements.parent.select('.' + options.hoverClassName);

    if (!spec) {
        return this.hover(null, null, options);
    }

    var htmlFunc = this.buildHTMLFunc(spec);
    if (hoverEl.empty()) {
        hoverEl = this._elements.parent.append('div').attr('class',options.hoverClassName);
    }
    hoverEl.style(options.hoverStyle);
    if (!hoverEl.mapmap_eventHandlerInstalled) {
        hoverEl.on('mouseenter', function() {
            hoverEl.style(options.hoverEnterStyle);
        }).on('mouseleave', function() {
            hoverEl.style(options.hoverLeaveStyle);
        });
        hoverEl.mapmap_eventHandlerInstalled = true;
    }
    
    function show(d, point){
        // offsetParent only works for rendered objects, so place object first!
        // https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement.offsetParent
        hoverEl.style(options.hoverEnterStyle);  
        
        var offsetEl = hoverEl.node().offsetParent || hoverEl,
            mainEl = this._elements.main.node(),
            bounds = this.getBoundingClientRect(),
            offsetBounds = offsetEl.getBoundingClientRect(),
            scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0,
            scrollLeft = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0,
            top = bounds.top - offsetBounds.top,
            left = bounds.left - offsetBounds.left;

        hoverEl
            .style({
                bottom: (offsetBounds.height - top - point.y) + 'px',
                //top: point.y + 'px',
                left: (left + point.x) + 'px'
            })
            .html(htmlFunc(d));
    }
    function hide() {
        hoverEl.style(options.hoverLeaveStyle);
    }
    
    return this.hover(show, hide, options);
};

// remove all symbology
// TODO: symbolizers should be registered somehow and iterated over here
mapmap.prototype.clear = function() {
    this.choropleth(null);
    this.proportional_circles(null);
    this.title(null);
    this.desc(null);
    return this;
};

// namespace for re-usable behaviors
mapmap.behavior = {};

mapmap.behavior.zoom = function(options) {

    options = dd.merge({
        event: 'click',
        cursor: 'pointer',
        fitScale: 0.7,
        animationDuration: 750,
        maxZoom: 8,
        hierarchical: false,
        showRing: true,
        ringRadius: 1.1, // relative to height/2
        zoomstart: null,
        zoomend: null,
        center: [center.x, center.y],
        ringAttributes: {
            stroke: '#000',
            'stroke-width': 6,
            'stroke-opacity': 0.3,
            'pointer-events': 'none',
            fill: 'none'
        },
        closeButton: function(parent) {
            parent.append('circle')
                .attr({
                    r: 10,
                    fill: '#fff',
                    stroke: '#000',
                    'stroke-width': 2.5,
                    'stroke-opacity': 0.9,
                    'fill-opacity': 0.9,
                    cursor: 'pointer'
                });
                
            parent.append('text')
                .attr({
                    'text-anchor':'middle',
                    cursor: 'pointer',
                    'font-weight': 'bold',
                    'font-size': '18',
                    y: 6
                })
                .text('×');
        },
        // TODO: how should highlighting work on the map generally?
        // maybe more like setState('highlight') and options.activestyle = 'highlight' ?
        activate: function(el) {
            d3.select(el).classed('active', true);
        },
        deactivate: function(el) {
            if (el) d3.select(el).classed('active', false);
        }        
    }, options);
    
    var ring = null,
        map = null,
        r, r0,
        zoomed = null;
    
    var z = function(selection) {
            
        map = this;

        var size = this.size();
        
        r = Math.min(size.height, size.width) / 2.0 * options.ringRadius;
        r0 = Math.sqrt(size.width*size.width + size.height*size.height) / 1.5;
            
        if (options.cursor) {
            selection.attr({
                cursor: options.cursor
            });
        }
        
        if (options.showRing && !ring) {
            ring = map._elements.fixed.selectAll('g.zoomRing')
                .data([1]);
            
            var newring = ring.enter()
                .append('g')
                .attr('class','zoomRing')
                .attr('transform','translate(' + size.width * options.center[0] + ',' + size.height * options.center[1] + ')');
                       
            newring.append('circle')
                .attr('class', 'main')
                .attr('r', r0)
                .attr(options.ringAttributes);
                
            var close = newring.append('g')
                .attr('class','zoomOut')
                .attr('transform','translate(' + (r0 * 0.707) + ',-' + (r0 * 0.707) + ')');
                        
            if (options.closeButton) {
                options.closeButton(close);
            }
            
        }

        // this is currently needed if e.g. search zooms to somewhere else,
        // but map is still zoomed in through this behavior
        // do a reset(), but without modifying the map view (=zooming out)
        map.on('view', function(translate, scale) {
            if (zoomed && scale == 1) {
                zoomed = null;
                animateRing(null);
                map._elements.map.select('.background').on(options.event + '.zoom', null);
                options.zoomstart && options.zoomstart.call(map, null);
                options.zoomend && options.zoomend.call(map, null);
            }
        });
                
        selection.on(options.event, function(d) {
            callHoverOut();
            if (zoomed == this) {
                reset();
            }
            else {
                options.deactivate(zoomed);
                var el = this;
                options.zoomstart && options.zoomstart.call(map, el);
                map.zoomToSelection(this, {
                    callback: function() {
                        options.zoomend && options.zoomend.call(map, el);
                    },
                    maxZoom: options.maxZoom,
                    center: options.center
                });
                animateRing(this);
                options.activate(this);
                zoomed = this;
                map._elements.map.select('.background').on(options.event + '.zoom', reset);
            }
        });

        if (zoomed) {
            options.zoomstart && options.zoomstart.call(map, zoomed);
            options.zoomend && options.zoomend.call(map, zoomed);
        }

    };
    
    function zoomTo(selection) {
        options.zoomstart && options.zoomstart.call(map, selection);
        map.zoomToSelection(selection, {
            callback: function() {
                options.zoomend && options.zoomend.call(map, selection);
            },
            maxZoom: options.maxZoom,
            center: options.center
        });
        animateRing(selection);
        zoomed = selection;
        map._elements.map.select('.background').on(options.event + '.zoom', reset);
    }

    function animateRing(selection) {
        if (ring) {
            var new_r = (selection) ? r : r0;
            
            ring.select('circle.main').transition().duration(options.animationDuration)
                .attr({
                    r: new_r
                })
            ;
            ring.select('g.zoomOut').transition().duration(options.animationDuration)
                .attr('transform', 'translate(' + (new_r * 0.707) + ',-' + (new_r * 0.707) + ')'); // sqrt(2) / 2

            // caveat: make sure to assign this every time to apply correct closure if we have multiple zoom behaviors!!
            ring.select('g.zoomOut').on('click', reset);
        }
    }
        
    function reset() {
        if (map) {
            options.deactivate(zoomed);
            zoomed = null;
            map.resetZoom();
            animateRing(null);
            map._elements.map.select('.background').on(options.event + '.zoom', null);
            if (options.zoomstart) {
                options.zoomstart.call(map, null);
            }
            if (options.zoomend) {
                options.zoomend.call(map, null);
            }
        }
    }
    
    z.reset = reset;
    
    z.active = function() {
        return zoomed;
    };   

    z.remove = function() {
        reset();
    };
        
    z.from = function(other){
        if (other && other.active) {
            zoomed = other.active();
            /*
            if (zoomed) {
                zoomTo(zoomed);
            }
            */
            // TODO: make up our mind whether this should remove the other behavior
            // in burgenland_demographie.html, we need to keep it as it would otherwise zoom out
            // but if we mix different behaviors, we may want to remove the other one automatically
            // (or maybe require it to be done manually)
            // in pendeln.js, we remove the other behavior here, which is inconsistent!
            
            //other.remove();
        }
        return z;
    };
    
    return z;
};

mapmap.prototype.animateView = function(translate, scale, callback, duration) {

    duration = duration || 750;
    
    if (translate[0] == this.current_translate[0] && translate[1] == this.current_translate[1] && scale == this.current_scale) {
        // nothing to do
        // yield to simulate async callback
        if (callback) {
            window.setTimeout(callback, 10);
        }
        return this;
    }
    this.current_translate = translate;
    this.current_scale = scale;
    callHoverOut();
    var map = this;
    this._elements.map.transition()
        .duration(duration)
        .call(map.zoom.translate(translate).scale(scale).event)
        .each('start', function() {
            map._elements.shadowGroup.attr('display','none');
        })
        .each('end', function() {
            map._elements.shadowGroup.attr('display','block');
            if (callback) {
                callback();
            }
        })
        .each('interrupt', function() {
            map._elements.shadowGroup.attr('display','block');
            // not sure if we should call callback here, but it may be non-intuitive
            // for callback to never be called if zoom is cancelled
            if (callback) {
                callback();
            }
        });        
    this.dispatcher.view.call(this, translate, scale);
    return this;
};

mapmap.prototype.setView = function(translate, scale) {

    translate = translate || this.current_translate;
    scale = scale || this.current_scale;
    
    this.current_translate = translate;
    this.current_scale = scale;
      
    // do we need this?
    //callHoverOut();

    this.zoom.translate(translate).scale(scale).event(this._elements.map);

    this.dispatcher.view.call(this, translate, scale);
    return this;
};

mapmap.prototype.getView = function() {
    return {
        translate: this.current_translate,
        scale: this.current_scale
    }
};

mapmap.prototype.zoomToSelection = function(selection, options) {
    
    options = dd.merge({
        fitScale: 0.7,
        animationDuration: 750,
        maxZoom: 8,
        center: [center.x, center.y]
    }, options);

    var sel = this.getRepresentations(selection),
        bounds = [[Infinity,Infinity],[-Infinity, -Infinity]],
        pathGenerator = d3.geo.path().projection(this._projection);    
    
    sel.each(function(el){
        var b = pathGenerator.bounds(el);
        bounds[0][0] = Math.min(bounds[0][0], b[0][0]);
        bounds[0][1] = Math.min(bounds[0][1], b[0][1]);
        bounds[1][0] = Math.max(bounds[1][0], b[1][0]);
        bounds[1][1] = Math.max(bounds[1][1], b[1][1]);
    });
    
    var dx = bounds[1][0] - bounds[0][0],
        dy = bounds[1][1] - bounds[0][1],
        x = (bounds[0][0] + bounds[1][0]) / 2,
        y = (bounds[0][1] + bounds[1][1]) / 2,
        size = this.size(),
        scale = Math.min(options.maxZoom, options.fitScale / Math.max(dx / size.width, dy / size.height)),
        translate = [size.width * options.center[0] - scale * x, size.height * options.center[1] - scale * y];
    this.animateView(translate, scale, options.callback, options.animationDuration);
    return this;
};

mapmap.prototype.zoomToBounds = function(bounds, callback, duration) {
    var w = bounds[1][0]-bounds[0][0],
        h = bounds[1][1]-bounds[0][1],
        cx = (bounds[1][0]+bounds[0][0]) / 2,
        cy = (bounds[1][1]+bounds[0][1]) / 2,
        size = this.size(),
        scale = Math.min(2, 0.9 / Math.max(w / size.width, h / size.height)),
        translate = [size.width * 0.5 - scale * cx, size.height * 0.5 - scale * cy];
    
    return this.animateView(translate, scale, callback, duration);
};

mapmap.prototype.zoomToCenter = function(center, scale, callback, duration) {

    scale = scale || 1;
    
    var size = this.size(),
        translate = [size.width * 0.5 - scale * center[0], size.height * 0.5 - scale * center[1]];

    return this.animateView(translate, scale, callback, duration);
};

mapmap.prototype.zoomToViewportPosition = function(center, scale, callback, duration) {

    var point = this._elements.main.node().createSVGPoint();

    point.x = center[0];
    point.y = center[1];

    var ctm = this._elements.geometry.node().getScreenCTM().inverse();
    point = point.matrixTransform(ctm);

    point = [point.x, point.y];
    
    scale = scale || 1;
    
    //var point = [(center[0]-this.current_translate[0])/this.current_scale, (center[1]-this.current_translate[1])/this.current_scale];
    
    return this.zoomToCenter(point, scale, callback, duration);
};

mapmap.prototype.resetZoom = function(callback, duration) {
    return this.animateView([0,0],1, callback, duration);
    // TODO take center into account zoomed-out, we may not always want this?
    //doZoom([width * (center.x-0.5),height * (center.y-0.5)],1);
};


// Manipulate representation geometry. This can be used e.g. to register event handlers.
// spec is a function to be called with selection to set up event handler
mapmap.prototype.applyBehavior = function(spec, selection) {

    assert(dd.isFunction(spec), "Behavior must be a function");
    
    var map = this;
    this._promise.geometry.then(function(topo) {
        var sel = map.getRepresentations(selection);
        // TODO: this should be configurable via options
        // and needs to integrate with managing pointer events (see hoverInfo)
        sel.style('pointer-events','visiblePainted');
        spec.call(map, sel);
    });
    return this;
};


// apply a behavior on the whole map pane (e.g. drag/zoom etc.)
mapmap.prototype.applyMapBehavior = function(spec) {
    spec.call(this, this._elements.map);
    return this;
};


// deprecated methods using UK-spelling
mapmap.prototype.applyBehaviour = function(spec, selection) {
    console && console.log && console.log("Deprecation warning: applyBehaviour() is deprecated, use applyBehavior() (US spelling) instead!");
    return this.applyBehavior(spec, selection);
}
mapmap.prototype.applyMapBehaviour = function(spec, selection) {
    console && console.log && console.log("Deprecation warning: applyMapBehaviour() is deprecated, use applyMapBehavior() (US spelling) instead!");
    return this.applyMapBehavior(spec, selection);
}

// handler for high-level events on the map object
mapmap.prototype.on = function(eventName, handler) {
    this.dispatcher.on(eventName, handler);
    return this;
};

function defaultRangeLabel(lower, upper, format, excludeLower, excludeUpper) {
    var f = format || function(lower){return lower};
        
    if (isNaN(lower)) {
        if (isNaN(upper)) {
            console.warn("rangeLabel: neither lower nor upper value specified!");
            return "";
        }
        else {
            return (excludeUpper ? "under " : "up to ") + f(upper);
        }
    }
    if (isNaN(upper)) {
        return excludeLower ? ("more than " + f(lower)) : (f(lower) + " and more");
    }
    return (excludeLower ? '> ' : '') + f(lower) + " to " + (excludeUpper ? '<' : '') + f(upper);
}

var d3_locales = {
    'en': {
        decimal: ".",
        thousands: ",",
        grouping: [ 3 ],
        currency: [ "$", "" ],
        dateTime: "%a %b %e %X %Y",
        date: "%m/%d/%Y",
        time: "%H:%M:%S",
        periods: [ "AM", "PM" ],
        days: [ "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday" ],
        shortDays: [ "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" ],
        months: [ "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December" ],
        shortMonths: [ "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" ],
        rangeLabel: defaultRangeLabel,
        undefinedLabel: "no data"
    },
    'de': {
        decimal: ",",
        thousands: ".",
        grouping: [3],
        currency: ["€", ""],
        dateTime: "%a %b %e %X %Y",
        date: "%d.%m.%Y",
        time: "%H:%M:%S",
        periods: ["AM", "PM"],
        days: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
        shortDays: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
        months: ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
        shortMonths: ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."],
        rangeLabel: function(lower, upper, format, excludeLower, excludeUpper) {
            var f = format || function(lower){return lower};
                
            if (isNaN(lower)) {
                if (isNaN(upper)) {
                    console.warn("rangeLabel: neither lower nor upper value specified!");
                    return "";
                }
                else {
                    return (excludeUpper ? "unter " : "bis ") + f(upper);
                }
            }
            if (isNaN(upper)) {
                return (excludeLower ? "mehr als " + f(lower) : f(lower) + " und mehr");
            }
            return (excludeLower ? '> ' : '') + f(lower) + " bis " + (excludeUpper ? '<' : '') + f(upper);
        },
        undefinedLabel: "keine Daten"
    }
};


mapmap.prototype.setLocale = function(lang){
    var locale;
    if (dd.isString(lang) && d3_locales[lang]) {
        locale = d3_locales[lang];
    }
    else {
        locale = lang;
    }
    this.locale = d3.locale(locale);
    
    // D3's locale doesn't support extended attributes,
    // so copy them over manually
    var keys = Object.keys(locale);
    for (var i=0; i<keys.length; i++) {
        var key = keys[i];
        if (!this.locale[key]) {
            this.locale[key] = locale[key];
        }
    }

    return this;
}

mapmap.prototype.options = function(spec, value) {

    // locale can be set through options but needs to be set up, so keep track of this here
    var oldLocale = this.settings.locale;

    mapmap.extend(this.settings, spec);
    
    if (this.settings.locale != oldLocale) {
        this.setLocale(this.settings.locale);
    }

    return this;
};

mapmap.prototype.legend = function(legend_func) {
    this.legend_func = legend_func;
    return this;
}
mapmap.prototype.updateLegend = function(attribute, reprAttribute, metadata, scale, selection) {

    if (!this.legend_func || !scale) {
        return this;
    }
    
    if (typeof metadata == 'string') {
        metadata = mapmap.getMetadata(metadata);
    }
    
    var range = scale.range(),
        classes,
        map = this; 

    var histogram = (function() {
        var data = null;
        return function(value) {
            // lazy initialization of histogram
            if (data == null) {
                data = {};
                var reprs = map.getRepresentations(selection)[0];
                reprs.forEach(function(repr) {
                    var val = repr.__data__.properties[attribute];
                    // make a separate bin for null/undefined values
                    // values are also invalid if numeric scale and non-numeric value
                    if (val == null || (metadata.scale != 'ordinal' && isNaN(val))) {
                        val = null;
                    }
                    else {
                        val = scale(val);
                    }
                    if (!data[val]) {
                        data[val] = [repr];
                    }
                    else {
                        data[val].push(repr);
                    }
                });
            }
            return data[value] || [];
        }
    })();
    
    function counter(r) {
        return function() {
            return histogram(r).length;
        }
    }   
    
    function objects(r) {
        return function() {
            return histogram(r);
        }
    }   
    
    // the main distinction is:
    // whether we have an output range divided into classes, or a continuous range
    // in the d3 API, numeric scales with a discrete range have an invertExtent method
    if (scale.invertExtent) {
        //classes = [scale.invertExtent(range[0])[0]];
        classes = range.map(function(r, i) {
            var extent = scale.invertExtent(r);
            // if we have too many items in range, both entries in extent will be undefined - ignore
            if (extent[0] == null && extent[1] == null) {
                console.warn("range for " + metadata.key + " contains superfluous value '" + r + "' - ignoring!");
                return null;
            }
            return {
                representation: r,
                valueRange: extent,
                includeLower: false,
                includeUpper: i<range.length-1,
                // lazy accessors - processing intensive
                count: counter(r),
                objects: objects(r)
                //TODO: other / more general aggregations?
            };
        })
        .filter(function(d){return d;});
    }
    else {
        // ordinal and continuous-range scales
        classes = range.map(function(r, i) {
            var value = undefined;
            if (scale.invert) {
                value = scale.invert(r);
            }
            return({
                representation: r,
                value: value,
                // lazy accessors - processing intensive
                count: counter(r),  
                objects: objects(r)
            });
        });
    }
    
    var undefinedClass = null;
    // TODO: hack to get undefined color box
    if (reprAttribute == 'fill' && metadata.undefinedColor != 'transparent') {
        undefinedClass = {
            representation: metadata.undefinedColor,
            'class': 'undefined',
            count: counter(null),
            objects: objects(null)
        };
    }
    
    this.legend_func.call(this, attribute, reprAttribute, metadata, classes, undefinedClass);
                    
    return this;

};

function valueOrCall(spec) {
    if (typeof spec == 'function') {
        return spec.apply(this, Array.prototype.slice.call(arguments, 1));
    }
    return spec;
}

// namespace for legend generation functions
mapmap.legend = {};

mapmap.legend.html = function(options) {

    var DEFAULTS = {
        legendClassName: 'mapLegend',
        legendStyle: {},
        cellStyle: {},
        colorBoxStyle: {
            overflow: 'hidden',
            display: 'inline-block',
            width: '3em',
            height: '1.5em',
            'vertical-align': '-0.5em',
            //border: '1px solid #444444',
            margin: '0 0.5em 0.2em 0'
        },
        colorFillStyle: {
            width: '0',
            height: '0',
            'border-width': '100px',
            'border-style': 'solid',
            'border-color': '#ffffff'
        },
        labelStyle: {},
        histogramBarStyle: {
            'display': 'inline-block',
            height: '1.1em',
            'font-size': '0.8em',
            'vertical-align': '0.1em',
            color: '#999999',
            'background-color': '#dddddd'
        },
        histogramBarWidth: 1
    };
    
    options = mapmap.extend(DEFAULTS, options);
    
    function parameterFunction(param, func) {
        if (dd.isFunction(param)) return param;
        return func(param);
    }
    
    options.histogramBarWidth = parameterFunction(options.histogramBarWidth, function(param) {
        return function(count) {
            var width = count * param;
            // always round up small values to make sure at least 1px wide
            if (width > 0 && width < 1) width = 1;
            return width;
        };
    });
    
    return function(attribute, reprAttribute, metadata, classes, undefinedClass) {
    
        var legend = this._elements.parent.select('.' + options.legendClassName);
        if (legend.empty()) {
            legend = this._elements.parent.append('div')
                .attr('class',options.legendClassName);
        }
        
        legend.style(options.legendStyle);
        
        // TODO: attribute may be a function, so we cannot easily generate a label for it
        var title = legend.selectAll('h3')
            .data([valueOrCall(metadata.label, attribute) || (dd.isString(attribute) ? attribute : '')]);
            
        title.enter().append('h3');
        
        title.html(function(d){return d;});
        
        // we need highest values first for numeric scales
        if (metadata.scale != 'ordinal') {
            classes.reverse();
        }
        if (undefinedClass) {
            classes.push(undefinedClass);
        }
        
        var cells = legend.selectAll('div.legendCell')
            .data(classes);
        
        cells.exit().remove();
        
        var newcells = cells.enter()
            .append('div')
            .style(options.cellStyle);
        
        cells
            .attr('class', 'legendCell')
            .each(function(d) {
                if (d.class) {
                    d3.select(this).classed(d.class, true);
                }
            });
        
        if (reprAttribute == 'fill') {
            if (classes[0].representation.substring(0,4) != 'url(') {
                newcells.append('span')
                    .attr('class', 'legendColor')
                    .style(options.colorBoxStyle)
                    .append('span')
                    .attr('class', 'fill')
                    .style(options.colorFillStyle);
                    
                cells.select('.legendColor .fill')
                    .transition()
                    .style({
                        'background-color': function(d) {return d.representation;},
                        'border-color': function(d) {return d.representation;},
                        'color': function(d) {return d.representation;}
                    });
            }
            else {
                newcells.append('svg')
                    .attr('class', 'legendColor')
                    .style(options.colorBoxStyle)
                    .append('rect')
                    .attr({
                        width: 100,
                        height: 100
                    });
                    
                cells.select('.legendColor rect')
                    .attr({
                        'fill': function(d) {return d.representation;}
                    });
            }
        }
        else if (reprAttribute == 'strokeColor') {
        
            newcells.append('span')
                .attr('class', 'legendColor')
                .style(options.colorBoxStyle)
                .style('border', 'none')
                .append('span')
                .attr('class', 'fill')
                .style(options.colorFillStyle);
                
            cells.select('.legendColor .fill')
                .transition()
                .style({
                    'background-color': function(d) {return d.representation;},
                    'border-color': function(d) {return d.representation;},
                    'color': function(d) {return d.representation;}
                });
        }
        
        newcells.append('span')
            .attr('class','legendLabel')
            .style(options.labelStyle);

        cells.attr('data-count',function(d) {return d.count();});
        
        cells.select('.legendLabel')
            .text(function(d) {
                var formatter;
                // TODO: we need some way of finding out whether we have intervals or values from the metadata
                // to cache the label formatter
                if (d.valueRange) {
                    formatter = metadata.getRangeFormatter();
                    return formatter(d.valueRange[0], d.valueRange[1], d.includeLower, d.includeUpper);
                }
                if (d.value) {
                    formatter = metadata.getFormatter();
                    return formatter(d.value);
                }
                return metadata.undefinedLabel;
            });
            
        if (options.histogram) {

            newcells.append('span')
                .attr('class', 'legendHistogramBar')
                .style(options.histogramBarStyle);

            cells.select('.legendHistogramBar').transition()
                .style('width', function(d){
                    var width = options.histogramBarWidth(d.count());
                    // string returned? -> use unchanged
                    if (width.length && width.indexOf('px') == width.lenght - 2) {
                        return width;
                    }
                    return Math.round(width) + 'px';
                })
                .text(function(d) { return ' ' + d.count(); });
        }
        
        if (options.callback) options.callback();
    }
}

mapmap.legend.svg = function(range, labelFormat, histogram, options) {

    var DEFAULTS = {
        cellSpacing: 5,
        layout: 'vertical',
        histogram: false,
        histogramLength: 80,
        containerAttributes: {
            transform: 'translate(20,10)'
        },
        backgroundAttributes: {
            fill: '#fff',
            'fill-opacity': 0.9,
            x: -10,
            y: -10,
            width: 220
        },
        cellAttributes: {
        },
        colorAttributes: {
            'width': 40,
            'height': 18,
            'stroke': '#000',
            'stroke-width': '0.5px',
            'fill': '#fff'  // this will be used before first transition
        },
        textAttributes: {
            'font-size': 10,
            'pointer-events': 'none',
            dy: 12
        },
        histogramBarAttributes: {
            width: 0,
            x: 140,
            y: 4,
            height: 10,
            fill: '#000',
            'fill-opacity': 0.2
        }
    };

    // TODO: we can't integrate thes into settings because it references settings attributes
    var layouts = {
        'horizontal': {
            cellAttributes: {
                transform: function(d,i){ return 'translate(' + i * (options.colorAttributes.width + options.cellSpacing) + ',0)';}
            },
            textAttributes: {
                y: function() { return options.colorAttributes.height + options.cellSpacing;}
                
            }
        },
        'vertical': {
            cellAttributes: {
                transform: function(d,i){ return 'translate(0,' + i * (options.colorAttributes.height + options.cellSpacing) + ')';}
            },
            textAttributes: {
                x: function() { return options.colorAttributes.width + options.cellSpacing;},
            }
        }
    };

    var layout = layouts[options.layout];
    
    if (options.layout == 'vertical') {
        range.reverse();
    }
    
    this._elements.legend.attr(options.containerAttributes);
 
    var bg = this._elements.legend.selectAll('rect.background')
        .data([1]);
    
    bg.enter()
        .append('rect')
        .attr('class', 'background')
        .attr(options.backgroundAttributes);
    bg.transition().attr('height', histogram.length * (options.colorAttributes.height + options.cellSpacing) + (20 - options.cellSpacing));    
        
    var cells = this._elements.legend.selectAll('g.cell')
        .data(range);
    
    cells.exit().remove();
    
    var newcells = cells.enter()
        .append('g')
        .attr('class', 'cell')
        .attr(options.cellAttributes)
        .attr(layout.cellAttributes);
        
    newcells.append('rect')
        .attr('class', 'color')
        .attr(options.colorAttributes)
        .attr(layout.colorAttributes);
                
    if (options.histogram) {

        newcells.append('rect')
            .attr("class", "bar")
            .attr(options.histogramBarAttributes);

        cells.select('.bar').transition()
            .attr("width", function(d,i){
                return histogram[histogram.length-i-1].y * options.histogramLength;
            });
    }

    newcells.append('text')
        .attr(options.textAttributes)
        .attr(layout.textAttributes);
    
    cells.select('.color').transition()
        .attr('fill', function(d) {return d;});
    
    cells.select('text')
        .text(labelFormat);
}

mapmap.prototype.projection = function(projection) {
    if (projection === undefined) return this._projection;
    this._projection = projection;
    return this;
}

mapmap.prototype.extent = function(selection, options) {

    var map = this;
    
    this.selected_extent = selection || this.selected;
    
    this._promise.geometry.then(function(topo) {
        // TODO: getRepresentations() depends on <path>s being drawn, but we want to 
        // be able to call extent() before draw() to set up projection
        // solution: manage merged geometry + data independent from SVG representation
        var geom = map.getRepresentations(map.selected_extent);
        var all = {
            'type': 'FeatureCollection',
            'features': []
        };
        geom.each(function(d){
            all.features.push(d);
        });

        map._extent(all, options);
    });
    return this;
};

mapmap.prototype._extent = function(geom, options) {

    options = dd.merge({
        fillFactor: 0.9
    }, options);
    
    // convert/merge topoJSON
    if (geom.type && geom.type == 'Topology') {
        // we need to merge all named features
        var names = Object.keys(geom.objects);
        var all = [];
        for (var i=0; i<names.length; i++) {
            all = all.concat(topojson.feature(geom, geom.objects[names[i]]).features);
        }
        geom = all;
    }
    if (dd.isArray(geom)) {
        var all = {
            'type': 'FeatureCollection',
            'features': geom
        };
        geom = all;
    }
    
    // reset scale to be able to calculate extents of geometry
    this._projection.scale(1).translate([0, 0]);
    var pathGenerator = d3.geo.path().projection(this._projection);
    var bounds = pathGenerator.bounds(geom);
    // use absolute values, as east does not always have to be right of west!
    bounds.height = Math.abs(bounds[1][1] - bounds[0][1]);
    bounds.width = Math.abs(bounds[1][0] - bounds[0][0]);
    
    // if we are not centered in midpoint, calculate "padding factor"
    var fac_x = 1 - Math.abs(0.5 - center.x) * 2,
        fac_y = 1 - Math.abs(0.5 - center.y) * 2;
        
    var size = this.size();
    var scale = options.fillFactor / Math.max(bounds.width / size.width / fac_x, bounds.height / size.height / fac_y);
    
    this._projection
        .scale(scale)
        .translate([(size.width - scale * (bounds[1][0] + bounds[0][0]))/ 2, (size.height - scale * (bounds[1][1] + bounds[0][1]))/ 2]);  
    
    // apply new projection to existing paths
    this._elements.map.selectAll("path")
        .attr("d", pathGenerator);        
    
};

function keyOrCallback(val) {
    if (typeof val != 'function') {
        return function(d){
            return d[val];
        };
    }
    return val;
}

module.exports = mapmap;
},{"datadata":1}]},{},[3])(3)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi4uLy4uLy4uL2RhdGFkYXRhL3NyYy9pbmRleC5qcyIsIi4uL2Jyb3dzZXJpZnkvbGliL19lbXB0eS5qcyIsInNyYy9pbmRleC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xvQkE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKiEgZGF0YWRhdGEuanMgwqkgMjAxNC0yMDE1IEZsb3JpYW4gTGVkZXJtYW5uIFxyXG5cclxuVGhpcyBwcm9ncmFtIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcclxuaXQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBHTlUgQWZmZXJvIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYXMgcHVibGlzaGVkIGJ5XHJcbnRoZSBGcmVlIFNvZnR3YXJlIEZvdW5kYXRpb24sIGVpdGhlciB2ZXJzaW9uIDMgb2YgdGhlIExpY2Vuc2UsIG9yXHJcbihhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXHJcblxyXG5UaGlzIHByb2dyYW0gaXMgZGlzdHJpYnV0ZWQgaW4gdGhlIGhvcGUgdGhhdCBpdCB3aWxsIGJlIHVzZWZ1bCxcclxuYnV0IFdJVEhPVVQgQU5ZIFdBUlJBTlRZOyB3aXRob3V0IGV2ZW4gdGhlIGltcGxpZWQgd2FycmFudHkgb2ZcclxuTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxyXG5HTlUgQWZmZXJvIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgZm9yIG1vcmUgZGV0YWlscy5cclxuXHJcbllvdSBzaG91bGQgaGF2ZSByZWNlaXZlZCBhIGNvcHkgb2YgdGhlIEdOVSBBZmZlcm8gR2VuZXJhbCBQdWJsaWMgTGljZW5zZVxyXG5hbG9uZyB3aXRoIHRoaXMgcHJvZ3JhbS4gIElmIG5vdCwgc2VlIDxodHRwOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cclxuKi9cclxuXHJcbid1c2Ugc3RyaWN0JztcclxuXHJcbi8vIHRlc3Qgd2hldGhlciBpbiBhIGJyb3dzZXIgZW52aXJvbm1lbnRcclxuaWYgKHR5cGVvZiB3aW5kb3cgPT09ICd1bmRlZmluZWQnKSB7XHJcbiAgICAvLyBub2RlXHJcbiAgICB2YXIgZDNkc3YgPSByZXF1aXJlKCdkMy1kc3YnKTtcclxuICAgIHZhciBmcyA9IHJlcXVpcmUoJ2ZzJyk7XHJcbiAgICBcclxuICAgIHZhciBmaWxlcGFyc2VyID0gZnVuY3Rpb24oZnVuYykge1xyXG4gICAgICAgIHJldHVybiBmdW5jdGlvbihwYXRoLCByb3csIGNhbGxiYWNrKSB7XHJcbiAgICAgICAgICAgIGlmIChkZC5pc1VuZGVmaW5lZChjYWxsYmFjaykpIHtcclxuICAgICAgICAgICAgICAgIGNhbGxiYWNrID0gcm93O1xyXG4gICAgICAgICAgICAgICAgcm93ID0gbnVsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBmcy5yZWFkRmlsZShwYXRoLCAndXRmOCcsIGZ1bmN0aW9uKGVycm9yLCBkYXRhKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiBjYWxsYmFjayhlcnJvcik7XHJcbiAgICAgICAgICAgICAgICBkYXRhID0gZnVuYyhkYXRhLCByb3cpO1xyXG4gICAgICAgICAgICAgICAgY2FsbGJhY2sobnVsbCxkYXRhKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHZhciBkMyA9IHtcclxuICAgICAgICBjc3Y6IGZpbGVwYXJzZXIoZDNkc3YuY3N2LnBhcnNlKSxcclxuICAgICAgICB0c3Y6IGZpbGVwYXJzZXIoZDNkc3YudHN2LnBhcnNlKSxcclxuICAgICAgICBqc29uOiBmaWxlcGFyc2VyKEpTT04ucGFyc2UpXHJcbiAgICB9O1xyXG5cclxufSBlbHNlIHtcclxuICAgIC8vIGJyb3dzZXJcclxuICAgIC8vIHdlIGV4cGVjdCBnbG9iYWwgZDMgdG8gYmUgYXZhaWxhYmxlXHJcbiAgICB2YXIgZDMgPSB3aW5kb3cuZDM7XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiByb3dGaWxlSGFuZGxlcihsb2FkZXIpIHtcclxuICAgIC8vIFRPRE86IGZpbGUgaGFuZGxlciBBUEkgc2hvdWxkIG5vdCBuZWVkIHRvIGJlIHBhc3NlZCBtYXAsIHJlZHVjZSBmdW5jdGlvbnMgYnV0IGJlIHdyYXBwZWQgZXh0ZXJuYWxseVxyXG4gICAgcmV0dXJuIGZ1bmN0aW9uKHBhdGgsIG1hcCwgcmVkdWNlLCBvcHRpb25zKSB7XHJcbiAgICBcclxuICAgICAgICBvcHRpb25zID0gZGQubWVyZ2Uoe1xyXG4gICAgICAgICAgICAvLyBkZWZhdWx0IGFjY2Vzc29yIGZ1bmN0aW9uIHRyaWVzIHRvIGNvbnZlcnQgbnVtYmVyLWxpa2Ugc3RyaW5ncyB0byBudW1iZXJzXHJcbiAgICAgICAgICAgIGFjY2Vzc29yOiBmdW5jdGlvbihkKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGQpO1xyXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaT0wOyBpPGtleXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXIga2V5ID0ga2V5c1tpXSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gZFtrZXldO1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIENTViBkb2Vzbid0IHN1cHBvcnQgc3BlY2lmaWNhdGlvbiBvZiBudWxsIHZhbHVlc1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIGludGVycHJldCBlbXB0eSBmaWVsZCB2YWx1ZXMgYXMgbWlzc2luZ1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWwgPT09IFwiXCIpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZFtrZXldID0gbnVsbDtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoZGQuaXNOdW1lcmljKHZhbCkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gdW5hcnkgKyBjb252ZXJ0cyBib3RoIGludHMgYW5kIGZsb2F0cyBjb3JyZWN0bHlcclxuICAgICAgICAgICAgICAgICAgICAgICAgZFtrZXldID0gK3ZhbDtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0sIG9wdGlvbnMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcclxuICAgICAgICAgICAgbG9hZGVyKHBhdGgsIG9wdGlvbnMuYWNjZXNzb3IsXHJcbiAgICAgICAgICAgICAgICBmdW5jdGlvbihlcnJvciwgZGF0YSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZGQubWFwcmVkdWNlKGRhdGEsIG1hcCwgcmVkdWNlKSk7ICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9KTsgXHJcbiAgICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBqc29uRmlsZUhhbmRsZXIocGF0aCwgbWFwLCByZWR1Y2UpIHtcclxuICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcclxuICAgICAgICBkMy5qc29uKHBhdGgsIGZ1bmN0aW9uKGVycm9yLCBkYXRhKSB7XHJcbiAgICAgICAgICAgIGlmIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoZGQuaXNBcnJheShkYXRhKSkge1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShkZC5tYXByZWR1Y2UoZGF0YSwgbWFwLCByZWR1Y2UpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIC8vIG9iamVjdCAtIHRyZWF0IGVudHJpZXMgYXMga2V5cyBieSBkZWZhdWx0XHJcbiAgICAgICAgICAgICAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGRhdGEpO1xyXG4gICAgICAgICAgICAgICAgdmFyIG1hcF9mdW5jO1xyXG4gICAgICAgICAgICAgICAgaWYgKCFtYXApIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyB1c2Uga2V5cyBhcyBkYXRhIHRvIGVtaXQga2V5L2RhdGEgcGFpcnMgaW4gbWFwIHN0ZXAhXHJcbiAgICAgICAgICAgICAgICAgICAgbWFwX2Z1bmMgPSBkZC5tYXAuZGljdChkYXRhKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIG1hcF9mdW5jID0gZnVuY3Rpb24oaywgZW1pdCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBwdXQgb3JpZ2luYWwga2V5IGludG8gb2JqZWN0XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciB2ID0gZGF0YVtrXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdi5fX2tleV9fID0gaztcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gY2FsbCB1c2VyLXByb3ZpZGVkIG1hcCBmdW50aW9uIHdpdGggb2JqZWN0XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hcCh2LCBlbWl0KTtcclxuICAgICAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShkZC5tYXByZWR1Y2Uoa2V5cywgbWFwX2Z1bmMsIHJlZHVjZSkpO1xyXG4gICAgICAgICAgICB9ICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICB9KTtcclxuICAgIH0pO1xyXG59XHJcblxyXG52YXIgZmlsZUhhbmRsZXJzID0ge1xyXG4gICAgJ2Nzdic6ICByb3dGaWxlSGFuZGxlcihkMy5jc3YpLFxyXG4gICAgJ3Rzdic6ICByb3dGaWxlSGFuZGxlcihkMy50c3YpLFxyXG4gICAgJ2pzb24nOiBqc29uRmlsZUhhbmRsZXJcclxufTtcclxuXHJcbnZhciBnZXRGaWxlSGFuZGxlciA9IGZ1bmN0aW9uKHBhdGhPckV4dCkge1xyXG4gICAgLy8gZ3Vlc3MgdHlwZVxyXG4gICAgdmFyIGV4dCA9IHBhdGhPckV4dC5zcGxpdCgnLicpLnBvcCgpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICByZXR1cm4gZmlsZUhhbmRsZXJzW2V4dF0gfHwgbnVsbDtcclxufTtcclxuXHJcbnZhciByZWdpc3RlckZpbGVIYW5kbGVyID0gZnVuY3Rpb24oZXh0LCBoYW5kbGVyKSB7XHJcbiAgICBmaWxlSGFuZGxlcnNbZXh0XSA9IGhhbmRsZXI7XHJcbn07XHJcblxyXG4vLyBUT0RPOiByZWdpc3RlciAudG9wb2pzb24sIC5nZW9qc29uIGluIG1hcG1hcC5qc1xyXG5cclxuLyoqXHJcbkRhdGFkYXRhIC0gYSBtb2R1bGUgZm9yIGxvYWRpbmcgYW5kIHByb2Nlc3NpbmcgZGF0YS5cclxuWW91IGNhbiBjYWxsIHRoZSBtb2R1bGUgYXMgYSBmdW5jdGlvbiB0byBjcmVhdGUgYSBwcm9taXNlIGZvciBkYXRhIGZyb20gYSBVUkwsIEZ1bmN0aW9uIG9yIEFycmF5LiBcclxuUmV0dXJucyBhIHByb21pc2UgZm9yIGRhdGEgZm9yIGV2ZXJ5dGhpbmcuXHJcbkBwYXJhbSB7KHN0cmluZ3xmdW5jdGlvbnxBcnJheSl9IHNwZWMgLSBBIFN0cmluZyAoVVJMKSwgRnVuY3Rpb24gb3IgQXJyYXkgb2YgZGF0YS5cclxuQHBhcmFtIHsoZnVuY3Rpb258c3RyaW5nKX0gW21hcD17QGxpbmsgZGF0YWRhdGEubWFwLmRpY3R9XSAgLSBUaGUgbWFwIGZ1bmN0aW9uIGZvciBtYXAvcmVkdWNlLlxyXG5AcGFyYW0geyhzdHJpbmcpfSBbcmVkdWNlPWRhdGFkYXRhLmVtaXQubGFzdF0gLSBUaGUgcmVkdWNlIGZ1bmN0aW9uIGZvciBtYXAvcmVkdWNlLlxyXG5AZXhwb3J0cyBtb2R1bGU6ZGF0YWRhdGFcclxuKi9cclxudmFyIGRkID0gZnVuY3Rpb24oc3BlYywgbWFwLCByZWR1Y2UsIG9wdGlvbnMpIHtcclxuXHJcbiAgICAvLyBvcHRpb25zXHJcbiAgICAvLyB0eXBlOiBvdmVycmlkZSBmaWxlIGV4dGVuc2lvbiwgZS5nLiBmb3IgQVBJIHVybHMgKGUuZy4gJ2NzdicpXHJcbiAgICAvLyBmaWxlSGFuZGxlcjogbWFudWFsbHkgc3BlY2lmeSBmaWxlIGhhbmRsZXIgdG8gYmUgdXNlZCB0byBsb2FkICYgcGFyc2UgZmlsZVxyXG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XHJcblxyXG4gICAgaWYgKHNwZWMgPT0gbnVsbCkgdGhyb3cgbmV3IEVycm9yKFwiZGF0YWRhdGEuanM6IE5vIGRhdGEgc3BlY2lmaWNhdGlvbi5cIik7XHJcbiAgICAgICAgXHJcbiAgICBpZiAobWFwICYmICFkZC5pc0Z1bmN0aW9uKG1hcCkpIHtcclxuICAgICAgICAvLyBtYXAgaXMgc3RyaW5nIC0+IG1hcCB0byBhdHRyaWJ1dGUgdmFsdWVcclxuICAgICAgICBtYXAgPSBkZC5tYXAua2V5KG1hcCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmIChkZC5pc1N0cmluZyhzcGVjKSkge1xyXG4gICAgICAgIC8vIGNvbnNpZGVyIHNwZWMgdG8gYmUgYSBVUkwvZmlsZSB0byBsb2FkXHJcbiAgICAgICAgdmFyIGhhbmRsZXIgPSBvcHRpb25zLmZpbGVIYW5kbGVyIHx8IGdldEZpbGVIYW5kbGVyKG9wdGlvbnMudHlwZSB8fCBzcGVjKTtcclxuICAgICAgICBpZiAoaGFuZGxlcikge1xyXG4gICAgICAgICAgICByZXR1cm4gaGFuZGxlcihzcGVjLCBtYXAsIHJlZHVjZSwgb3B0aW9ucyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJkYXRhZGF0YS5qczogVW5rbm93biBmaWxlIHR5cGUgZm9yOiBcIiArIHNwZWMpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGlmIChkZC5pc0FycmF5KHNwZWMpKSB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xyXG4gICAgICAgICAgICByZXNvbHZlKGRkLm1hcHJlZHVjZShzcGVjLCBtYXAsIHJlZHVjZSkpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiZGF0YWRhdGEuanM6IFVua25vd24gZGF0YSBzcGVjaWZpY2F0aW9uLlwiKTtcclxufTtcclxuXHJcbi8vIGV4cG9zZSByZWdpc3RyYXRpb24gbWV0aG9kICYgcm93RmlsZUhhbmRsZXIgaGVscGVyXHJcbmRkLnJlZ2lzdGVyRmlsZUhhbmRsZXIgPSByZWdpc3RlckZpbGVIYW5kbGVyO1xyXG5kZC5yb3dGaWxlSGFuZGxlciA9IHJvd0ZpbGVIYW5kbGVyO1xyXG5cclxuLy8gc2ltcGxlIGxvYWQgZnVuY3Rpb24sIHJldHVybnMgYSBwcm9taXNlIGZvciBkYXRhIHdpdGhvdXQgbWFwL3JlZHVjZS1pbmdcclxuLy8gRE8gTk9UIFVTRSAtIHByZXNlbnQgb25seSBmb3IgbWFwbWFwLmpzIGxlZ2FjeSByZWFzb25zXHJcbmRkLmxvYWQgPSBmdW5jdGlvbihzcGVjLCBrZXkpIHtcclxuICAgIGlmIChzcGVjLnRoZW4gJiYgdHlwZW9mIHNwZWMudGhlbiA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIC8vIGFscmVhZHkgYSB0aGVuYWJsZSAvIHByb21pc2VcclxuICAgICAgICByZXR1cm4gc3BlYztcclxuICAgIH1cclxuICAgIGVsc2UgaWYgKGRkLmlzU3RyaW5nKHNwZWMpKSB7XHJcbiAgICAgICAgLy8gY29uc2lkZXIgc3BlYyB0byBiZSBhIFVSTCB0byBsb2FkXHJcbiAgICAgICAgLy8gZ3Vlc3MgdHlwZVxyXG4gICAgICAgIHZhciBleHQgPSBzcGVjLnNwbGl0KCcuJykucG9wKCk7XHJcbiAgICAgICAgaWYgKGV4dCA9PSAnanNvbicgfHwgZXh0ID09ICd0b3BvanNvbicgfHwgZXh0ID09ICdnZW9qc29uJykge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XHJcbiAgICAgICAgICAgICAgICBkMy5qc29uKHNwZWMsIGZ1bmN0aW9uKGVycm9yLCBkYXRhKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShkYXRhKTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcIlVua25vd24gZXh0ZW5zaW9uOiBcIiArIGV4dCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59O1xyXG5cclxuXHJcbi8vIFR5cGUgY2hlY2tpbmdcclxuLyoqXHJcblJldHVybiB0cnVlIGlmIGFyZ3VtZW50IGlzIGEgc3RyaW5nLlxyXG5AcGFyYW0ge2FueX0gdmFsIC0gVGhlIHZhbHVlIHRvIGNoZWNrLlxyXG4qL1xyXG5kZC5pc1N0cmluZyA9IGZ1bmN0aW9uICh2YWwpIHtcclxuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbCkgPT0gJ1tvYmplY3QgU3RyaW5nXSc7XHJcbn07XHJcbi8qKlxyXG5SZXR1cm4gdHJ1ZSBpZiBhcmd1bWVudCBpcyBhIGZ1bmN0aW9uLlxyXG5AcGFyYW0ge2FueX0gdmFsIC0gVGhlIHZhbHVlIHRvIGNoZWNrLlxyXG4qL1xyXG5kZC5pc0Z1bmN0aW9uID0gZnVuY3Rpb24ob2JqKSB7XHJcbiAgICByZXR1cm4gKHR5cGVvZiBvYmogPT09ICdmdW5jdGlvbicpO1xyXG59O1xyXG4vKipcclxuUmV0dXJuIHRydWUgaWYgYXJndW1lbnQgaXMgYW4gQXJyYXkuXHJcbkBwYXJhbSB7YW55fSB2YWwgLSBUaGUgdmFsdWUgdG8gY2hlY2suXHJcbiovXHJcbmRkLmlzQXJyYXkgPSBmdW5jdGlvbihvYmopIHtcclxuICAgIHJldHVybiAob2JqIGluc3RhbmNlb2YgQXJyYXkpO1xyXG59O1xyXG4vKipcclxuUmV0dXJuIHRydWUgaWYgYXJndW1lbnQgaXMgYW4gT2JqZWN0LCBidXQgbm90IGFuIEFycmF5LCBTdHJpbmcgb3IgYW55dGhpbmcgY3JlYXRlZCB3aXRoIGEgY3VzdG9tIGNvbnN0cnVjdG9yLlxyXG5AcGFyYW0ge2FueX0gdmFsIC0gVGhlIHZhbHVlIHRvIGNoZWNrLlxyXG4qL1xyXG5kZC5pc0RpY3Rpb25hcnkgPSBmdW5jdGlvbihvYmopIHtcclxuICAgIHJldHVybiAob2JqICYmIG9iai5jb25zdHJ1Y3RvciAmJiBvYmouY29uc3RydWN0b3IgPT09IE9iamVjdCk7XHJcbn07XHJcbi8qKlxyXG5SZXR1cm4gdHJ1ZSBpZiBhcmd1bWVudCBpcyB1bmRlZmluZWQuXHJcbkBwYXJhbSB7YW55fSB2YWwgLSBUaGUgdmFsdWUgdG8gY2hlY2suXHJcbiovXHJcbmRkLmlzVW5kZWZpbmVkID0gZnVuY3Rpb24ob2JqKSB7XHJcbiAgICByZXR1cm4gKHR5cGVvZiBvYmogPT0gJ3VuZGVmaW5lZCcpO1xyXG59O1xyXG4vKipcclxuUmV0dXJuIHRydWUgaWYgYXJndW1lbnQgaXMgYSBudW1iZXIgb3IgYSBzdHJpbmcgdGhhdCBzdHJpY3RseSBsb29rcyBsaWtlIGEgbnVtYmVyLlxyXG5UaGlzIG1ldGhvZCBpcyBzdHJpY3RlciB0aGFuICt2YWwgb3IgcGFyc2VJbnQodmFsKSBhcyBpdCBkb2Vzbid0IHZhbGlkYXRlIHRoZSBlbXB0eVxyXG5zdHJpbmcgb3Igc3RyaW5ncyBjb250aW5pbmcgYW55IG5vbi1udW1lcmljIGNoYXJhY3RlcnMuIFxyXG5AcGFyYW0ge2FueX0gdmFsIC0gVGhlIHZhbHVlIHRvIGNoZWNrLlxyXG4qL1xyXG5kZC5pc051bWVyaWMgPSBmdW5jdGlvbih2YWwpIHtcclxuICAgIC8vIGNoZWNrIGlmIHN0cmluZyBsb29rcyBsaWtlIGEgbnVtYmVyXHJcbiAgICAvLyArXCJcIiA9PiAwXHJcbiAgICAvLyBwYXJzZUludChcIlwiKSA9PiBOYU5cclxuICAgIC8vIHBhcnNlSW50KFwiMTIzT0tcIikgPT4gMTIzXHJcbiAgICAvLyArXCIxMjNPS1wiID0+IE5hTlxyXG4gICAgLy8gc28gd2UgbmVlZCB0byBwYXNzIGJvdGggdG8gYmUgc3RyaWN0XHJcbiAgICByZXR1cm4gIWlzTmFOKCt2YWwpICYmICFpc05hTihwYXJzZUZsb2F0KHZhbCkpO1xyXG59XHJcblxyXG4vLyBUeXBlIGNvbnZlcnNpb24gLyB1dGlsaXRpZXNcclxuLyoqXHJcbklmIHRoZSBhcmd1bWVudCBpcyBhbHJlYWR5IGFuIEFycmF5LCByZXR1cm4gYSBjb3B5IG9mIHRoZSBBcnJheS5cclxuRWxzZSwgcmV0dXJuIGEgc2luZ2xlLWVsZW1lbnQgQXJyYXkgY29udGFpbmluZyB0aGUgYXJndW1lbnQuXHJcbiovXHJcbmRkLnRvQXJyYXkgPSBmdW5jdGlvbih2YWwpIHtcclxuICAgIGlmICghdmFsKSByZXR1cm4gW107XHJcbiAgICAvLyByZXR1cm4gYSBjb3B5IGlmIGFyZWFkeSBhcnJheSwgZWxzZSBzaW5nbGUtZWxlbWVudCBhcnJheVxyXG4gICAgcmV0dXJuIGRkLmlzQXJyYXkodmFsKSA/IHZhbC5zbGljZSgpIDogW3ZhbF07XHJcbn07XHJcblxyXG4vKipcclxuU2hhbGxvdyBvYmplY3QgbWVyZ2luZywgbWFpbmx5IGZvciBvcHRpb25zLiBSZXR1cm5zIGEgbmV3IG9iamVjdC5cclxuKi9cclxuZGQubWVyZ2UgPSBmdW5jdGlvbigpIHtcclxuICAgIHZhciBvYmogPSB7fTtcclxuXHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIHZhciBzcmMgPSBhcmd1bWVudHNbaV07XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIga2V5IGluIHNyYykge1xyXG4gICAgICAgICAgICBpZiAoc3JjLmhhc093blByb3BlcnR5KGtleSkpIHtcclxuICAgICAgICAgICAgICAgIG9ialtrZXldID0gc3JjW2tleV07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIG9iajtcclxufTtcclxuXHJcbi8qKlxyXG5SZXR1cm4gYW4ge0BsaW5rIG1vZHVsZTpkYXRhZGF0YS5PcmRlcmVkSGFzaHxPcmRlcmVkSGFzaH0gb2JqZWN0LlxyXG5AZXhwb3J0cyBtb2R1bGU6ZGF0YWRhdGEuT3JkZXJlZEhhc2hcclxuKi9cclxuZGQuT3JkZXJlZEhhc2ggPSBmdW5jdGlvbigpIHtcclxuICAgIC8vIG9yZGVyZWQgaGFzaCBpbXBsZW1lbnRhdGlvblxyXG4gICAgdmFyIGtleXMgPSBbXTtcclxuICAgIHZhciB2YWxzID0ge307XHJcbiAgICBcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgLyoqXHJcbiAgICAgICAgQWRkIGEga2V5L3ZhbHVlIHBhaXIgdG8gdGhlIGVuZCBvZiB0aGUgT3JkZXJlZEhhc2guXHJcbiAgICAgICAgQHBhcmFtIHtTdHJpbmd9IGsgLSBLZXlcclxuICAgICAgICBAcGFyYW0gdiAtIFZhbHVlXHJcbiAgICAgICAgKi9cclxuICAgICAgICBwdXNoOiBmdW5jdGlvbihrLHYpIHtcclxuICAgICAgICAgICAgaWYgKCF2YWxzW2tdKSBrZXlzLnB1c2goayk7XHJcbiAgICAgICAgICAgIHZhbHNba10gPSB2O1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgLyoqXHJcbiAgICAgICAgSW5zZXJ0IGEga2V5L3ZhbHVlIHBhaXIgYXQgdGhlIHNwZWNpZmllZCBwb3NpdGlvbi5cclxuICAgICAgICBAcGFyYW0ge051bWJlcn0gaSAtIEluZGV4IHRvIGluc2VydCB2YWx1ZSBhdFxyXG4gICAgICAgIEBwYXJhbSB7U3RyaW5nfSBrIC0gS2V5XHJcbiAgICAgICAgQHBhcmFtIHYgLSBWYWx1ZVxyXG4gICAgICAgICovXHJcbiAgICAgICAgaW5zZXJ0OiBmdW5jdGlvbihpLGssdikge1xyXG4gICAgICAgICAgICBpZiAoIXZhbHNba10pIHtcclxuICAgICAgICAgICAgICAgIGtleXMuc3BsaWNlKGksMCxrKTtcclxuICAgICAgICAgICAgICAgIHZhbHNba10gPSB2O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSxcclxuICAgICAgICAvKipcclxuICAgICAgICBSZXR1cm4gdGhlIHZhbHVlIGZvciBzcGVjaWZpZWQga2V5LlxyXG4gICAgICAgIEBwYXJhbSB7U3RyaW5nfSBrIC0gS2V5XHJcbiAgICAgICAgKi9cclxuICAgICAgICBnZXQ6IGZ1bmN0aW9uKGspIHtcclxuICAgICAgICAgICAgLy8gc3RyaW5nIC0+IGtleVxyXG4gICAgICAgICAgICByZXR1cm4gdmFsc1trXTtcclxuICAgICAgICB9LFxyXG4gICAgICAgIC8qKlxyXG4gICAgICAgIFJldHVybiB0aGUgdmFsdWUgYXQgc3BlY2lmaWVkIGluZGV4IHBvc2l0aW9uLlxyXG4gICAgICAgIEBwYXJhbSB7U3RyaW5nfSBpIC0gSW5kZXhcclxuICAgICAgICAqL1xyXG4gICAgICAgIGF0OiBmdW5jdGlvbihpKSB7XHJcbiAgICAgICAgICAgIC8vIG51bWJlciAtPiBudGggb2JqZWN0XHJcbiAgICAgICAgICAgIHJldHVybiB2YWxzW2tleXNbaV1dO1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgbGVuZ3RoOiBmdW5jdGlvbigpe3JldHVybiBrZXlzLmxlbmd0aDt9LFxyXG4gICAgICAgIGtleXM6IGZ1bmN0aW9uKCl7cmV0dXJuIGtleXM7fSxcclxuICAgICAgICBrZXk6IGZ1bmN0aW9uKGkpIHtyZXR1cm4ga2V5c1tpXTt9LFxyXG4gICAgICAgIHZhbHVlczogZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBrZXlzLm1hcChmdW5jdGlvbihrZXkpe3JldHVybiB2YWxzW2tleV07fSk7XHJcbiAgICAgICAgfSxcclxuICAgICAgICBtYXA6IGZ1bmN0aW9uKGZ1bmMpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGtleXMubWFwKGZ1bmN0aW9uKGspe3JldHVybiBmdW5jKGssIHZhbHNba10pO30pO1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgdW5zb3J0ZWRfZGljdDogZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB2YWxzO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcbn07XHJcblxyXG4vLyBVdGlsaXR5IGZ1bmN0aW9ucyBmb3IgbWFwL3JlZHVjZVxyXG5kZC5tYXAgPSB7XHJcbiAgICBrZXk6IGZ1bmN0aW9uKGF0dHIsIHJlbWFwKSB7XHJcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGQsIGVtaXQpIHtcclxuICAgICAgICAgICAgdmFyIGtleSA9IGRbYXR0cl07XHJcbiAgICAgICAgICAgIGlmIChyZW1hcCAmJiByZW1hcFtrZXldICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIGtleSA9IHJlbWFwW2tleV07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZW1pdChrZXksIGQpO1xyXG4gICAgICAgIH07XHJcbiAgICB9LFxyXG4gICAgZGljdDogZnVuY3Rpb24oZGljdCkge1xyXG4gICAgICAgIHJldHVybiBmdW5jdGlvbihkLCBlbWl0KSB7XHJcbiAgICAgICAgICAgIGVtaXQoZCwgZGljdFtkXSk7XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxufTtcclxuZGQuZW1pdCA9IHtcclxuICAgIGlkZW50OiBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gZnVuY3Rpb24oa2V5LCB2YWx1ZXMsIGVtaXQpIHtcclxuICAgICAgICAgICAgZW1pdChrZXksIHZhbHVlcyk7XHJcbiAgICAgICAgfTtcclxuICAgIH0sXHJcbiAgICBmaXJzdDogZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGtleSwgdmFsdWVzLCBlbWl0KSB7XHJcbiAgICAgICAgICAgIGVtaXQoa2V5LCB2YWx1ZXNbMF0pO1xyXG4gICAgICAgIH07XHJcbiAgICB9LFxyXG4gICAgbGFzdDogZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGtleSwgdmFsdWVzLCBlbWl0KSB7XHJcbiAgICAgICAgICAgIGVtaXQoa2V5LCB2YWx1ZXNbdmFsdWVzLmxlbmd0aCAtIDFdKTtcclxuICAgICAgICB9O1xyXG4gICAgfSxcclxuICAgIG1lcmdlOiBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gZnVuY3Rpb24oa2V5LCB2YWx1ZXMsIGVtaXQpIHtcclxuICAgICAgICAgICAgdmFyIG9iaiA9IHZhbHVlcy5yZWR1Y2UoZnVuY3Rpb24ocHJldiwgY3Vycikge1xyXG4gICAgICAgICAgICAgICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhjdXJyKTtcclxuICAgICAgICAgICAgICAgIGZvciAodmFyIGk9MDsgaTxrZXlzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIGsgPSBrZXlzW2ldO1xyXG4gICAgICAgICAgICAgICAgICAgIHByZXZba10gPSBjdXJyW2tdO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHByZXY7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZW1pdChrZXksIG9iaik7XHJcbiAgICAgICAgfTtcclxuICAgIH0sXHJcbiAgICB0b0F0dHI6IGZ1bmN0aW9uKGF0dHIsIGZ1bmMpIHtcclxuICAgICAgICBmdW5jID0gZnVuYyB8fCBkZC5lbWl0Lmxhc3QoKTtcclxuICAgICAgICByZXR1cm4gZnVuY3Rpb24oa2V5LCB2YWx1ZXMsIGVtaXQpIHtcclxuICAgICAgICAgICAgZnVuYyhrZXksIHZhbHVlcywgZnVuY3Rpb24oaywgdikge1xyXG4gICAgICAgICAgICAgICAgdmFyIG9iaiA9IHt9O1xyXG4gICAgICAgICAgICAgICAgb2JqW2F0dHJdID0gdjtcclxuICAgICAgICAgICAgICAgIGVtaXQoaywgb2JqKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfTtcclxuICAgIH0sXHJcbiAgICBzdW06IGZ1bmN0aW9uKGluY2x1ZGUsIGV4Y2x1ZGUpIHtcclxuICAgICAgICBpbmNsdWRlID0gd2lsZGNhcmRzKGluY2x1ZGUgfHwgJyonKTtcclxuICAgICAgICBleGNsdWRlID0gd2lsZGNhcmRzKGV4Y2x1ZGUpOyAgICAgICBcclxuXHJcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGtleSwgdmFsdWVzLCBlbWl0KSB7XHJcbiAgICAgICAgICAgIHZhciBvYmogPSB2YWx1ZXMucmVkdWNlKGZ1bmN0aW9uKHByZXYsIGN1cnIpIHtcclxuICAgICAgICAgICAgICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMoY3Vycik7XHJcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpPTA7IGk8a2V5cy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBrZXkgPSBrZXlzW2ldLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBkb0FkZCA9IGZhbHNlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBqO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGZvciAoaj0wOyBqPGluY2x1ZGUubGVuZ3RoOyBqKyspIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGtleS5zZWFyY2goaW5jbHVkZVtpXSkgPiAtMSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZG9BZGQgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgZm9yIChqPTA7IGo8ZXhjbHVkZS5sZW5ndGg7IGorKykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoa2V5LnNlYXJjaChpbmNsdWRlW2pdKSA+IC0xKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkb0FkZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGRvQWRkICYmIHByZXZba2V5XSAmJiBjdXJyW2tleV0gJiYgIWlzTmFOKHByZXZba2V5XSkgJiYgIWlzTmFOKGN1cnJba2V5XSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcHJldltrZXldID0gcHJldltrZXldICsgY3VycltrZXldO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcHJldltrZXldID0gY3VycltrZXldO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZG9BZGQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihcImRhdGFkYXRhLmVtaXQuc3VtKCk6IENhbm5vdCBhZGQga2V5cyBcIiArIGtleSArIFwiIVwiKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiBwcmV2O1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGVtaXQoa2V5LCBvYmopO1xyXG4gICAgICAgIH07XHJcbiAgICB9XHJcbn07XHJcblxyXG5kZC5tYXAuZ2VvID0ge1xyXG4gICAgcG9pbnQ6IGZ1bmN0aW9uKGxhdFByb3AsIGxvblByb3AsIGtleVByb3ApIHtcclxuICAgICAgICB2YXIgaWQgPSAwO1xyXG4gICAgICAgIHJldHVybiBmdW5jdGlvbihkLCBlbWl0KSB7XHJcbiAgICAgICAgICAgIHZhciBrZXkgPSBrZXlQcm9wID8gZFtrZXlQcm9wXSA6IGlkKys7XHJcbiAgICAgICAgICAgIGVtaXQoa2V5LCBkZC5nZW8uUG9pbnQoZFtsb25Qcm9wXSwgZFtsYXRQcm9wXSwgZCkpO1xyXG4gICAgICAgIH07XHJcbiAgICB9XHJcbn07XHJcblxyXG5kZC5lbWl0LmdlbyA9IHtcclxuICAgIHNlZ21lbnRzOiBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gZnVuY3Rpb24oa2V5LCBkYXRhLCBlbWl0KSB7XHJcbiAgICAgICAgICAgIHZhciBwcmV2ID0gbnVsbCwgY3VyID0gbnVsbDtcclxuICAgICAgICAgICAgZm9yICh2YXIgaT0wOyBpPGRhdGEubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgICAgIGN1ciA9IGRhdGFbaV07XHJcbiAgICAgICAgICAgICAgICBpZiAocHJldikge1xyXG4gICAgICAgICAgICAgICAgICAgIGVtaXQoa2V5ICsgJy0nICsgaSwgZGQuZ2VvLkxpbmVTdHJpbmcoW1twcmV2LmxvbixwcmV2LmxhdF0sW2N1ci5sb24sY3VyLmxhdF1dLCBwcmV2KSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBwcmV2ID0gY3VyO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxufTtcclxuXHJcbi8vIGNvbnN0cnVjdG9ycyBmb3IgR2VvSlNPTiBvYmplY3RzXHJcbmRkLmdlbyA9IHtcclxuICAgIFBvaW50OiBmdW5jdGlvbihsb24sIGxhdCwgcHJvcGVydGllcykge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIHR5cGU6ICdGZWF0dXJlJyxcclxuICAgICAgICAgICAgZ2VvbWV0cnk6IHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdQb2ludCcsXHJcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlczogW2xvbiwgbGF0XVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBwcm9wZXJ0aWVzOiBwcm9wZXJ0aWVzXHJcbiAgICAgICAgfTtcclxuICAgIH0sXHJcbiAgICBMaW5lU3RyaW5nOiBmdW5jdGlvbihjb29yZGluYXRlcywgcHJvcGVydGllcykge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIHR5cGU6ICdGZWF0dXJlJyxcclxuICAgICAgICAgICAgZ2VvbWV0cnk6IHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdMaW5lU3RyaW5nJyxcclxuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzOiBjb29yZGluYXRlc1xyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBwcm9wZXJ0aWVzOiBwcm9wZXJ0aWVzXHJcbiAgICAgICAgfTtcclxuICAgIH1cclxufTtcclxuXHJcbmZ1bmN0aW9uIHdpbGRjYXJkcyhzcGVjKSB7XHJcbiAgICBzcGVjID0gZGQudG9BcnJheShzcGVjKTtcclxuICAgIGZvciAodmFyIGk9MDsgaTxzcGVjLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgaWYgKCEoc3BlY1tpXSBpbnN0YW5jZW9mIFJlZ0V4cCkpIHtcclxuICAgICAgICAgICAgc3BlY1tpXSA9IG5ldyBSZWdFeHAoJ14nICsgc3BlY1tpXS5yZXBsYWNlKCcqJywnLionKS5yZXBsYWNlKCc/JywnLicpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gc3BlYztcclxufVxyXG5cclxuLy8gaHR0cHM6Ly9jb2RlLmdvb2dsZS5jb20vcC9tYXByZWR1Y2UtanMvXHJcbi8vIE1vemlsbGEgUHVibGljIExpY2Vuc2VcclxuZGQubWFwcmVkdWNlID0gZnVuY3Rpb24gKGRhdGEsIG1hcCwgcmVkdWNlKSB7XHJcblx0dmFyIG1hcFJlc3VsdCA9IFtdLFxyXG4gICAgICAgIHJlZHVjZVJlc3VsdCA9IGRkLk9yZGVyZWRIYXNoKCksXHJcbiAgICAgICAgcmVkdWNlS2V5O1xyXG5cdFxyXG4gICAgcmVkdWNlID0gcmVkdWNlIHx8IGRkLmVtaXQubGFzdCgpOyAvLyBkZWZhdWx0XHJcbiAgICBcclxuXHR2YXIgbWFwRW1pdCA9IGZ1bmN0aW9uKGtleSwgdmFsdWUpIHtcclxuICAgICAgICBpZiAoa2V5ID09IG51bGwpIHJldHVybjsgLy8gZG8gbm90IGVtaXQgaWYga2V5IGlzIG51bGwgb3IgdW5kZWZpbmVkXHJcblx0XHRpZighbWFwUmVzdWx0W2tleV0pIHtcclxuXHRcdFx0bWFwUmVzdWx0W2tleV0gPSBbXTtcclxuXHRcdH1cclxuXHRcdG1hcFJlc3VsdFtrZXldLnB1c2godmFsdWUpO1xyXG5cdH07XHJcblx0XHJcblx0dmFyIHJlZHVjZUVtaXQgPSBmdW5jdGlvbihrZXksIHZhbHVlKSB7XHJcblx0XHRyZWR1Y2VSZXN1bHQucHVzaChrZXksIHZhbHVlKTtcclxuXHR9O1xyXG5cdFxyXG5cdGZvcih2YXIgaSA9IDA7IGkgPCBkYXRhLmxlbmd0aDsgaSsrKSB7XHJcblx0XHRtYXAoZGF0YVtpXSwgbWFwRW1pdCk7XHJcblx0fVxyXG5cdFxyXG5cdGZvcihyZWR1Y2VLZXkgaW4gbWFwUmVzdWx0KSB7XHJcblx0XHRyZWR1Y2UocmVkdWNlS2V5LCBtYXBSZXN1bHRbcmVkdWNlS2V5XSwgcmVkdWNlRW1pdCk7XHJcblx0fVxyXG5cdFxyXG5cdHJldHVybiByZWR1Y2VSZXN1bHQ7XHJcbn07XHJcblxyXG5kZC5tYXByZWR1Y2VyID0gZnVuY3Rpb24obWFwLCByZWR1Y2UpIHtcclxuICAgIHJldHVybiBmdW5jdGlvbihkYXRhKSB7XHJcbiAgICAgICAgZGQubWFwcmVkdWNlKGRhdGEsIG1hcCwgcmVkdWNlKTtcclxuICAgIH07XHJcbn07XHJcbi8vIEhlbHBlciBmdW5jdGlvbnMgZm9yIG1hcCBldGMuXHJcblxyXG4vLyBwdXQgJ2QnIGluIGFub3RoZXIgb2JqZWN0IHVzaW5nIHRoZSBhdHRyaWJ1dGUgJ2tleSdcclxuLy8gb3B0aW9uYWwgJ3B1bGwnIGlzIHRoZSBuYW1lIG9mIGEga2V5IHRvIGxlYXZlIG9uIHRoZSB0b3AgbGV2ZWwgXHJcbmRkLmVudmVsb3BlID0gZnVuY3Rpb24oa2V5LCBwdWxsLCBmdW5jKSB7XHJcbiAgICByZXR1cm4gZnVuY3Rpb24oZCkge1xyXG4gICAgICAgIGlmIChwdWxsICYmIHR5cGVvZiBwdWxsID09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgLy8gZW52ZWxvcGUoa2V5LCBmdW5jKSBjYXNlXHJcbiAgICAgICAgICAgIGZ1bmMgPSBwdWxsO1xyXG4gICAgICAgICAgICBwdWxsID0gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGZ1bmMpIGQgPSBmdW5jKGQpO1xyXG4gICAgICAgIHZhciB2YWwgPSB7fTtcclxuICAgICAgICB2YWxba2V5XSA9IGQ7XHJcbiAgICAgICAgaWYgKHB1bGwpIHtcclxuICAgICAgICAgICAgdmFsW3B1bGxdID0gZFtwdWxsXTtcclxuICAgICAgICAgICAgZGVsZXRlIGRbcHVsbF07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB2YWw7XHJcbiAgICB9O1xyXG59O1xyXG5kZC5wcmVmaXggPSBmdW5jdGlvbihwcmVmaXgsIGZ1bmMpIHtcclxuICAgIHJldHVybiBmdW5jdGlvbihkKSB7XHJcbiAgICBcclxuICAgICAgICBpZiAoZnVuYykgZCA9IGZ1bmMoZCk7XHJcbiAgICBcclxuICAgICAgICB2YXIgdmFsID0ge30sXHJcbiAgICAgICAgICAgIGtleXMgPSBPYmplY3Qua2V5cyhkKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIgaT0wOyBpPGtleXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgdmFsW3ByZWZpeCArIGtleXNbaV1dID0gZFtrZXlzW2ldXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIHJldHVybiB2YWw7XHJcbiAgICB9O1xyXG59O1xyXG5kZC5wcmVmaXhfYXR0ciA9IGZ1bmN0aW9uKGF0dHIsIGZ1bmMpIHtcclxuICAgIHJldHVybiBmdW5jdGlvbihkKSB7XHJcbiAgICBcclxuICAgICAgICBpZiAoZnVuYykgZCA9IGZ1bmMoZCk7XHJcbiAgICBcclxuICAgICAgICB2YXIgdmFsID0ge30sXHJcbiAgICAgICAgICAgIGtleXMgPSBPYmplY3Qua2V5cyhkKSxcclxuICAgICAgICAgICAgcHJlZml4ID0gZFthdHRyXSA/IGRbYXR0cl0gKyAnXycgOiAnJztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIgaT0wOyBpPGtleXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgdmFsW3ByZWZpeCArIGtleXNbaV1dID0gZFtrZXlzW2ldXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIHJldHVybiB2YWw7XHJcbiAgICB9O1xyXG59O1xyXG5kZC5tYXBfYXR0ciA9IGZ1bmN0aW9uKG1hcCwgZnVuYykge1xyXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGQpIHtcclxuICAgIFxyXG4gICAgICAgIGlmIChmdW5jKSBkID0gZnVuYyhkKTtcclxuICAgIFxyXG4gICAgICAgIGlmICh0eXBlb2YgbWFwID09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgZCA9IG1hcChkKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMobWFwKTtcclxuICAgICAgICAgICAgZm9yICh2YXIgaT0wOyBpPGtleXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgICAgIHZhciBrZXkgPSBrZXlzW2ldO1xyXG4gICAgICAgICAgICAgICAgdmFyIHZhbCA9IG1hcFtrZXldO1xyXG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWwgPT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICAgICAgICAgIGRba2V5XSA9IHZhbChkKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGRbdmFsXSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGRba2V5XSA9IGRbdmFsXTtcclxuICAgICAgICAgICAgICAgICAgICBkZWxldGUgZFt2YWxdO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICByZXR1cm4gZDtcclxuICAgIH07XHJcbn07XHJcbmRkLnJldmVyc2UgPSBmdW5jdGlvbihkYXRhKSB7XHJcbiAgICBpZiAoZGF0YS5zbGljZSAmJiB0eXBlb2YgZGF0YS5zbGljZSA9PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgLy8gc2xpY2UoKSA9IGNvcHlcclxuICAgICAgICByZXR1cm4gZGF0YS5zbGljZSgpLnJldmVyc2UoKTsgXHJcbiAgICB9XHJcbiAgICByZXR1cm4gZGF0YTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZGQ7XHJcbiIsbnVsbCwiLyohIG1hcG1hcC5qcyAwLjIuOC1kZXYuMCDCqSAyMDE0LTIwMTUgRmxvcmlhbiBMZWRlcm1hbm4gXHJcblxyXG5UaGlzIHByb2dyYW0gaXMgZnJlZSBzb2Z0d2FyZTogeW91IGNhbiByZWRpc3RyaWJ1dGUgaXQgYW5kL29yIG1vZGlmeVxyXG5pdCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIEdOVSBBZmZlcm8gR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhcyBwdWJsaXNoZWQgYnlcclxudGhlIEZyZWUgU29mdHdhcmUgRm91bmRhdGlvbiwgZWl0aGVyIHZlcnNpb24gMyBvZiB0aGUgTGljZW5zZSwgb3JcclxuKGF0IHlvdXIgb3B0aW9uKSBhbnkgbGF0ZXIgdmVyc2lvbi5cclxuXHJcblRoaXMgcHJvZ3JhbSBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxyXG5idXQgV0lUSE9VVCBBTlkgV0FSUkFOVFk7IHdpdGhvdXQgZXZlbiB0aGUgaW1wbGllZCB3YXJyYW50eSBvZlxyXG5NRVJDSEFOVEFCSUxJVFkgb3IgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UuICBTZWUgdGhlXHJcbkdOVSBBZmZlcm8gR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxyXG5cclxuWW91IHNob3VsZCBoYXZlIHJlY2VpdmVkIGEgY29weSBvZiB0aGUgR05VIEFmZmVybyBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlXHJcbmFsb25nIHdpdGggdGhpcyBwcm9ncmFtLiAgSWYgbm90LCBzZWUgPGh0dHA6Ly93d3cuZ251Lm9yZy9saWNlbnNlcy8+LlxyXG4qL1xyXG5cclxudmFyIGRkID0gcmVxdWlyZSgnZGF0YWRhdGEnKTtcclxuXHJcbnZhciB2ZXJzaW9uID0gJzAuMi44LWRldi4wJztcclxuXHJcbmZ1bmN0aW9uIGFzc2VydCh0ZXN0LCBtZXNzYWdlKSB7IGlmICh0ZXN0KSByZXR1cm47IHRocm93IG5ldyBFcnJvcihcIlttYXBtYXBdIFwiICsgbWVzc2FnZSk7fVxyXG5hc3NlcnQod2luZG93LmQzLCBcImQzLmpzIGlzIHJlcXVpcmVkIVwiKTtcclxuYXNzZXJ0KHdpbmRvdy5Qcm9taXNlLCBcIlByb21pc2VzIG5vdCBhdmFpbGFibGUgaW4geW91ciBicm93c2VyIC0gcGxlYXNlIGFkZCB0aGUgbmVjZXNzYXJ5IHBvbHlmaWxsLCBhcyBkZXRhaWxlZCBpbiBodHRwczovL2dpdGh1Yi5jb20vZmxvbGVkZXJtYW5uL21hcG1hcC5qcyN1c2luZy1tYXBtYXBqc1wiKTtcclxuXHJcbnZhciBkZWZhdWx0X3NldHRpbmdzID0ge1xyXG4gICAgbG9jYWxlOiAnZW4nLFxyXG4gICAga2VlcEFzcGVjdFJhdGlvOiB0cnVlLFxyXG4gICAgcGxhY2Vob2xkZXJDbGFzc05hbWU6ICdwbGFjZWhvbGRlcicsXHJcbiAgICBzdmdBdHRyaWJ1dGVzOiB7XHJcbiAgICAgICAgJ292ZXJmbG93JzogJ2hpZGRlbicgLy8gbmVlZGVkIGZvciBJRVxyXG4gICAgfSxcclxuICAgIHBhdGhBdHRyaWJ1dGVzOiB7XHJcbiAgICAgICAgJ2ZpbGwnOiAnbm9uZScsXHJcbiAgICAgICAgJ3N0cm9rZSc6ICcjMDAwJyxcclxuICAgICAgICAnc3Ryb2tlLXdpZHRoJzogJzAuMnB4JyxcclxuICAgICAgICAnc3Ryb2tlLWxpbmVqb2luJzogJ2JldmVsJyxcclxuICAgICAgICAncG9pbnRlci1ldmVudHMnOiAnbm9uZSdcclxuICAgIH0sXHJcbiAgICBiYWNrZ3JvdW5kQXR0cmlidXRlczoge1xyXG4gICAgICAgICd3aWR0aCc6ICczMDAlJyxcclxuICAgICAgICAnaGVpZ2h0JzogJzMwMCUnLFxyXG4gICAgICAgICdmaWxsJzogJ25vbmUnLFxyXG4gICAgICAgICdzdHJva2UnOiAnbm9uZScsXHJcbiAgICAgICAgJ3RyYW5zZm9ybSc6ICd0cmFuc2xhdGUoLTgwMCwtNDAwKScsXHJcbiAgICAgICAgJ3BvaW50ZXItZXZlbnRzJzogJ2FsbCdcclxuICAgIH0sXHJcbiAgICBvdmVybGF5QXR0cmlidXRlczoge1xyXG4gICAgICAgICdmaWxsJzogJyNmZmZmZmYnLFxyXG4gICAgICAgICdmaWxsLW9wYWNpdHknOiAnMC4yJyxcclxuICAgICAgICAnc3Ryb2tlLXdpZHRoJzogJzAuOCcsXHJcbiAgICAgICAgJ3N0cm9rZSc6ICcjMzMzJyxcclxuICAgICAgICAncG9pbnRlci1ldmVudHMnOiAnbm9uZSdcclxuICAgIH0sXHJcbiAgICBkZWZhdWx0TWV0YWRhdGE6IHtcclxuICAgICAgICAvLyBkb21haW46ICBpcyBkZXRlcm1pbmVkIGJ5IGRhdGEgYW5hbHlzaXNcclxuICAgICAgICBzY2FsZTogJ3F1YW50aXplJyxcclxuICAgICAgICBjb2xvcnM6IFtcIiNmZmZmY2NcIixcIiNjN2U5YjRcIixcIiM3ZmNkYmJcIixcIiM0MWI2YzRcIixcIiMyYzdmYjhcIixcIiMyNTM0OTRcIl0sIC8vIENvbG9yYnJld2VyIFlsR25CdVs2XSBcclxuICAgICAgICB1bmRlZmluZWRWYWx1ZTogXCJcIiwgLy9cInVuZGVmaW5lZFwiXHJcbiAgICAgICAgLy91bmRlZmluZWRMYWJlbDogLT4gZnJvbSBsb2NhbGVcclxuICAgICAgICB1bmRlZmluZWRDb2xvcjogJ3RyYW5zcGFyZW50J1xyXG4gICAgfVxyXG59O1xyXG5cclxudmFyIG1hcG1hcCA9IGZ1bmN0aW9uKGVsZW1lbnQsIG9wdGlvbnMpIHtcclxuICAgIC8vIGVuc3VyZSBjb25zdHJ1Y3RvciBpbnZvY2F0aW9uXHJcbiAgICBpZiAoISh0aGlzIGluc3RhbmNlb2YgbWFwbWFwKSkgcmV0dXJuIG5ldyBtYXBtYXAoZWxlbWVudCwgb3B0aW9ucyk7XHJcblxyXG4gICAgdGhpcy5zZXR0aW5ncyA9IHt9OyAgICBcclxuICAgIHRoaXMub3B0aW9ucyhtYXBtYXAuZXh0ZW5kKHt9LCBkZWZhdWx0X3NldHRpbmdzLCBvcHRpb25zKSk7XHJcbiAgICBcclxuICAgIC8vIHByb21pc2VzXHJcbiAgICB0aGlzLl9wcm9taXNlID0ge1xyXG4gICAgICAgIGdlb21ldHJ5OiBudWxsLFxyXG4gICAgICAgIGRhdGE6IG51bGxcclxuICAgIH07XHJcblxyXG4gICAgdGhpcy5zZWxlY3RlZCA9IG51bGw7XHJcbiAgICBcclxuICAgIHRoaXMubGF5ZXJzID0gbmV3IGRkLk9yZGVyZWRIYXNoKCk7XHJcbiAgICAvL3RoaXMuaWRlbnRpZnlfZnVuYyA9IGlkZW50aWZ5X2xheWVyO1xyXG4gICAgdGhpcy5pZGVudGlmeV9mdW5jID0gaWRlbnRpZnlfYnlfcHJvcGVydGllcygpO1xyXG4gICAgXHJcbiAgICB0aGlzLm1ldGFkYXRhX3NwZWNzID0gW107XHJcblxyXG4gICAgLy8gY29udmVydCBzZWxldG9yIGV4cHJlc3Npb24gdG8gbm9kZVxyXG4gICAgZWxlbWVudCA9IGQzLnNlbGVjdChlbGVtZW50KS5ub2RlKCk7XHJcbiBcclxuICAgIC8vIGRlZmF1bHRzXHJcbiAgICB0aGlzLl9wcm9qZWN0aW9uID0gZDMuZ2VvLm1lcmNhdG9yKCkuc2NhbGUoMSk7XHJcbiAgICBcclxuICAgIHRoaXMuaW5pdEVuZ2luZShlbGVtZW50KTtcclxuICAgIHRoaXMuaW5pdEV2ZW50cyhlbGVtZW50KTtcclxuICAgIFxyXG4gICAgdGhpcy5kaXNwYXRjaGVyID0gZDMuZGlzcGF0Y2goJ2Nob3JvcGxldGgnLCd2aWV3JywnY2xpY2snLCdtb3VzZWRvd24nLCdtb3VzZXVwJywnbW91c2Vtb3ZlJyk7XHJcbiAgICBcclxuICAgIHJldHVybiB0aGlzOyAgICBcclxufTtcclxuXHJcbi8vIGV4cG9zZSBkYXRhZGF0YSBsaWJyYXJ5IGluIGNhc2Ugd2UgYXJlIGJ1bmRsZWQgZm9yIGJyb3dzZXJcclxuLy8gKGJyb3dzZXJpZnkgZG9lc24ndCBzdXBwb3J0IG11dGxpcGxlIGdsb2JhbCBleHBvcnRzKVxyXG5tYXBtYXAuZGF0YWRhdGEgPSBkZDtcclxuXHJcbm1hcG1hcC5wcm90b3R5cGUgPSB7XHJcblx0dmVyc2lvbjogdmVyc2lvblxyXG59O1xyXG5cclxubWFwbWFwLmV4dGVuZCA9IGZ1bmN0aW9uIGV4dGVuZCgpe1xyXG4gICAgZm9yKHZhciBpPTE7IGk8YXJndW1lbnRzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgIGZvcih2YXIga2V5IGluIGFyZ3VtZW50c1tpXSlcclxuICAgICAgICAgICAgaWYoYXJndW1lbnRzW2ldLmhhc093blByb3BlcnR5KGtleSkpXHJcbiAgICAgICAgICAgICAgICBhcmd1bWVudHNbMF1ba2V5XSA9IGFyZ3VtZW50c1tpXVtrZXldO1xyXG4gICAgcmV0dXJuIGFyZ3VtZW50c1swXTtcclxufVxyXG5cclxubWFwbWFwLnByb3RvdHlwZS5pbml0RW5naW5lID0gZnVuY3Rpb24oZWxlbWVudCkge1xyXG4gICAgLy8gU1ZHIHNwZWNpZmljIGluaXRpYWxpemF0aW9uLCBmb3Igbm93IHdlIGhhdmUgbm8gZW5naW5lIHN3aXRjaGluZyBmdW5jdGlvbmFsaXR5XHJcbiAgICBcclxuICAgIC8vIEhUTUwgZWxlbWVudHMsIHN0b3JlZCBhcyBkMyBzZWxlY3Rpb25zICAgIFxyXG4gICAgdmFyIG1haW5FbCA9IGQzLnNlbGVjdChlbGVtZW50KS5jbGFzc2VkKCdtYXBtYXAnLCB0cnVlKSxcclxuICAgICAgICBtYXBFbCA9IG1haW5FbC5hcHBlbmQoJ2cnKS5hdHRyKCdjbGFzcycsICdtYXAnKTtcclxuICAgIFxyXG4gICAgbWFpbkVsLmF0dHIodGhpcy5zZXR0aW5ncy5zdmdBdHRyaWJ1dGVzKTtcclxuICAgIFxyXG4gICAgdGhpcy5fZWxlbWVudHMgPSB7XHJcbiAgICAgICAgbWFpbjogbWFpbkVsLFxyXG4gICAgICAgIG1hcDogbWFwRWwsXHJcbiAgICAgICAgcGFyZW50OiBkMy5zZWxlY3QobWFpbkVsLm5vZGUoKS5wYXJlbnROb2RlKSxcclxuICAgICAgICAvLyBjaGlsZCBlbGVtZW50c1xyXG4gICAgICAgIGRlZnM6IG1haW5FbC5pbnNlcnQoJ2RlZnMnLCAnLm1hcCcpLFxyXG4gICAgICAgIGJhY2tncm91bmRHZW9tZXRyeTogbWFwRWwuYXBwZW5kKCdnJykuYXR0cignY2xhc3MnLCAnYmFja2dyb3VuZC1nZW9tZXRyeScpLFxyXG4gICAgICAgIGJhY2tncm91bmQ6IG1hcEVsLmFwcGVuZCgncmVjdCcpLmF0dHIoJ2NsYXNzJywgJ2JhY2tncm91bmQnKS5hdHRyKHRoaXMuc2V0dGluZ3MuYmFja2dyb3VuZEF0dHJpYnV0ZXMpLFxyXG4gICAgICAgIHNoYWRvd0dyb3VwOiBtYXBFbC5hcHBlbmQoJ2cnKSxcclxuICAgICAgICBnZW9tZXRyeTogbWFwRWwuYXBwZW5kKCdnJykuYXR0cignY2xhc3MnLCAnZ2VvbWV0cnknKSxcclxuICAgICAgICBvdmVybGF5OiBtYXBFbC5hcHBlbmQoJ2cnKS5hdHRyKCdjbGFzcycsICdvdmVybGF5cycpLFxyXG4gICAgICAgIGZpeGVkOiBtYWluRWwuYXBwZW5kKCdnJykuYXR0cignY2xhc3MnLCAnZml4ZWQnKSxcclxuICAgICAgICBsZWdlbmQ6IG1haW5FbC5hcHBlbmQoJ2cnKS5hdHRyKCdjbGFzcycsICdsZWdlbmQnKSxcclxuICAgICAgICBwbGFjZWhvbGRlcjogbWFpbkVsLnNlbGVjdCgnLicgKyB0aGlzLnNldHRpbmdzLnBsYWNlaG9sZGVyQ2xhc3NOYW1lKVxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgLy8gc2V0IHVwIHdpZHRoL2hlaWdodFxyXG4gICAgdGhpcy53aWR0aCA9IG51bGw7XHJcbiAgICB0aGlzLmhlaWdodCA9IG51bGw7XHJcbiAgICBcclxuICAgIC8vIFRPRE86IHVzZSBvcHRpb25zLndpZHRoIHx8IG9wdGlvbnMuZGVmYXVsdFdpZHRoIGV0Yy5cclxuICAgIGlmICghdGhpcy53aWR0aCkge1xyXG4gICAgICAgIHRoaXMud2lkdGggPSBwYXJzZUludChtYWluRWwuYXR0cignd2lkdGgnKSkgfHwgODAwO1xyXG4gICAgfVxyXG4gICAgaWYgKCF0aGlzLmhlaWdodCkge1xyXG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gcGFyc2VJbnQobWFpbkVsLmF0dHIoJ2hlaWdodCcpKSB8fCA0MDA7XHJcbiAgICB9XHJcbiAgICB2YXIgdmlld0JveCA9IG1haW5FbC5hdHRyKCd2aWV3Qm94Jyk7XHJcbiAgICBpZiAoIXZpZXdCb3gpIHtcclxuICAgICAgICBtYWluRWwuYXR0cigndmlld0JveCcsICcwIDAgJyArIHRoaXMud2lkdGggKyAnICcgKyB0aGlzLmhlaWdodCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRoaXMuX2VsZW1lbnRzLmRlZnMuYXBwZW5kKCdmaWx0ZXInKVxyXG4gICAgICAgIC5hdHRyKCdpZCcsICdzaGFkb3ctZ2xvdycpXHJcbiAgICAgICAgLmFwcGVuZCgnZmVHYXVzc2lhbkJsdXInKVxyXG4gICAgICAgIC5hdHRyKCdzdGREZXZpYXRpb24nLCA1KTtcclxuXHJcbiAgICB0aGlzLl9lbGVtZW50cy5kZWZzLmFwcGVuZCgnZmlsdGVyJylcclxuICAgICAgICAuYXR0cignaWQnLCAnbGlnaHQtZ2xvdycpXHJcbiAgICAgICAgLmFwcGVuZCgnZmVHYXVzc2lhbkJsdXInKVxyXG4gICAgICAgIC5hdHRyKCdzdGREZXZpYXRpb24nLCAxKTtcclxuICAgIFxyXG4gICAgdGhpcy5fZWxlbWVudHMuc2hhZG93RWwgPSB0aGlzLl9lbGVtZW50cy5zaGFkb3dHcm91cFxyXG4gICAgICAgIC5hcHBlbmQoJ2cnKVxyXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdzaGFkb3cnKVxyXG4gICAgICAgIC5hdHRyKCdmaWx0ZXInLCAndXJsKCNzaGFkb3ctZ2xvdyknKTtcclxuICAgICAgICBcclxuICAgIHRoaXMuX2VsZW1lbnRzLnNoYWRvd0Nyb3BFbCA9IHRoaXMuX2VsZW1lbnRzLnNoYWRvd0dyb3VwXHJcbiAgICAgICAgLmFwcGVuZCgnZycpXHJcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3NoYWRvdy1jcm9wJyk7XHJcbiAgICAgICBcclxuICAgIHRoaXMuc3VwcG9ydHMgPSB7fTtcclxuICAgIFxyXG4gICAgLy8gZmVhdHVyZSBkZXRlY3Rpb25cclxuICAgIHZhciBlbCA9IHRoaXMuX2VsZW1lbnRzLm1haW4uYXBwZW5kKCdwYXRoJykuYXR0cih7XHJcbiAgICAgICAgJ3BhaW50LW9yZGVyJzogJ3N0cm9rZScsXHJcbiAgICAgICAgJ3ZlY3Rvci1lZmZlY3QnOiAnbm9uLXNjYWxpbmctc3Ryb2tlJ1xyXG4gICAgfSk7ICBcclxuICAgIFxyXG4gICAgdmFyIHZhbCA9IGdldENvbXB1dGVkU3R5bGUoZWwubm9kZSgpKS5nZXRQcm9wZXJ0eVZhbHVlKCdwYWludC1vcmRlcicpO1xyXG4gICAgdGhpcy5zdXBwb3J0cy5wYWludE9yZGVyID0gdmFsICYmIHZhbC5pbmRleE9mKCdzdHJva2UnKSA9PSAwO1xyXG4gICAgXHJcbiAgICB2YWwgPSBnZXRDb21wdXRlZFN0eWxlKGVsLm5vZGUoKSkuZ2V0UHJvcGVydHlWYWx1ZSgndmVjdG9yLWVmZmVjdCcpO1xyXG4gICAgdGhpcy5zdXBwb3J0cy5ub25TY2FsaW5nU3Ryb2tlID0gdmFsICYmIHZhbC5pbmRleE9mKCdub24tc2NhbGluZy1zdHJva2UnKSA9PSAwO1xyXG4gICAgdGhpcy5fZWxlbWVudHMubWFpbi5jbGFzc2VkKCdzdXBwb3J0cy1ub24tc2NhbGluZy1zdHJva2UnLCB0aGlzLnN1cHBvcnRzLm5vblNjYWxpbmdTdHJva2UpO1xyXG4gICAgICAgIFxyXG4gICAgZWwucmVtb3ZlKCk7XHJcbiAgICBcclxuICAgIC8vIGNvbXBhdGliaWxpdHkgc2V0dGluZ3NcclxuICAgIGlmIChuYXZpZ2F0b3IudXNlckFnZW50LmluZGV4T2YoJ01TSUUnKSAhPT0gLTEgfHwgbmF2aWdhdG9yLmFwcFZlcnNpb24uaW5kZXhPZignVHJpZGVudC8nKSA+IDApIHtcclxuICAgICAgICB0aGlzLnN1cHBvcnRzLmhvdmVyRG9tTW9kaWZpY2F0aW9uID0gZmFsc2U7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgICB0aGlzLnN1cHBvcnRzLmhvdmVyRG9tTW9kaWZpY2F0aW9uID0gdHJ1ZTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRmlyZWZveCA8IDM1IHdpbGwgcmVwb3J0IHdyb25nIEJvdW5kaW5nQ2xpZW50UmVjdCAoYWRkaW5nIGNsaXBwZWQgYmFja2dyb3VuZCksXHJcbiAgICAvLyBodHRwczovL2J1Z3ppbGxhLm1vemlsbGEub3JnL3Nob3dfYnVnLmNnaT9pZD01MzA5ODVcclxuICAgIHZhciBtYXRjaCA9IC9GaXJlZm94XFwvKFxcZCspLy5leGVjKG5hdmlnYXRvci51c2VyQWdlbnQpO1xyXG4gICAgaWYgKG1hdGNoICYmIHBhcnNlSW50KG1hdGNoWzFdKSA8IDM1KSB7XHJcbiAgICAgICAgdGhpcy5zdXBwb3J0cy5zdmdHZXRCb3VuZGluZ0NsaWVudFJlY3QgPSBmYWxzZTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICAgIHRoaXMuc3VwcG9ydHMuc3ZnR2V0Qm91bmRpbmdDbGllbnRSZWN0ID0gdHJ1ZTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdmFyIG1hcCA9IHRoaXM7XHJcbiAgICAvLyBzYXZlIHZpZXdwb3J0IHN0YXRlIHNlcGFyYXRlbHksIGFzIHpvb20gbWF5IG5vdCBoYXZlIGV4YWN0IHZhbHVlcyAoZHVlIHRvIGFuaW1hdGlvbiBpbnRlcnBvbGF0aW9uKVxyXG4gICAgdGhpcy5jdXJyZW50X3NjYWxlID0gMTtcclxuICAgIHRoaXMuY3VycmVudF90cmFuc2xhdGUgPSBbMCwwXTtcclxuICAgIFxyXG4gICAgdGhpcy56b29tID0gZDMuYmVoYXZpb3Iuem9vbSgpXHJcbiAgICAgICAgLnRyYW5zbGF0ZShbMCwgMF0pXHJcbiAgICAgICAgLnNjYWxlKDEpXHJcbiAgICAgICAgLnNjYWxlRXh0ZW50KFsxLCA4XSlcclxuICAgICAgICAub24oJ3pvb20nLCBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIG1hcC5jdXJyZW50X3NjYWxlID0gZDMuZXZlbnQuc2NhbGU7XHJcbiAgICAgICAgICAgIG1hcC5jdXJyZW50X3RyYW5zbGF0ZSA9IGQzLmV2ZW50LnRyYW5zbGF0ZTtcclxuICAgICAgICAgICAgbWFwRWwuYXR0cigndHJhbnNmb3JtJywgJ3RyYW5zbGF0ZSgnICsgZDMuZXZlbnQudHJhbnNsYXRlICsgJylzY2FsZSgnICsgZDMuZXZlbnQuc2NhbGUgKyAnKScpO1xyXG4gICAgICAgICAgICBpZiAoIW1hcC5zdXBwb3J0cy5ub25TY2FsaW5nU3Ryb2tlKSB7XHJcbiAgICAgICAgICAgICAgICAvL21hcC5fZWxlbWVudHMuZ2VvbWV0cnkuc2VsZWN0QWxsKFwicGF0aFwiKS5zdHlsZShcInN0cm9rZS13aWR0aFwiLCAxLjUgLyBkMy5ldmVudC5zY2FsZSArIFwicHhcIik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICBtYXBFbFxyXG4gICAgICAgIC8vLmNhbGwodGhpcy56b29tKSAvLyBmcmVlIG1vdXNld2hlZWwgem9vbWluZ1xyXG4gICAgICAgIC5jYWxsKHRoaXMuem9vbS5ldmVudCk7XHJcbiAgICAgIC8qICBcclxuICAgIHZhciBkcmFnID0gZDMuYmVoYXZpb3IuZHJhZygpXHJcbiAgICAgICAgLm9yaWdpbihmdW5jdGlvbigpIHtyZXR1cm4ge3g6bWFwLmN1cnJlbnRfdHJhbnNsYXRlWzBdLHk6bWFwLmN1cnJlbnRfdHJhbnNsYXRlWzFdfTt9KVxyXG4gICAgICAgIC5vbignZHJhZ3N0YXJ0JywgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIGQzLmV2ZW50LnNvdXJjZUV2ZW50LnN0b3BQcm9wYWdhdGlvbigpOyBcclxuICAgICAgICB9KVxyXG4gICAgICAgIC5vbignZHJhZ2VuZCcsIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICBkMy5ldmVudC5zb3VyY2VFdmVudC5zdG9wUHJvcGFnYXRpb24oKTsgXHJcbiAgICAgICAgfSlcclxuICAgICAgICAub24oJ2RyYWcnLCBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgbWFwLmN1cnJlbnRfdHJhbnNsYXRlID0gW2QzLmV2ZW50LngsIGQzLmV2ZW50LnldO1xyXG4gICAgICAgICAgICBtYXBFbC5hdHRyKCd0cmFuc2Zvcm0nLCAndHJhbnNsYXRlKCcgKyBkMy5ldmVudC54ICsgJywnICsgZDMuZXZlbnQueSArICcpc2NhbGUoJyArIG1hcC5jdXJyZW50X3NjYWxlICsgJyknKTtcclxuICAgICAgICB9KVxyXG4gICAgOyovXHJcbiAgICAgICAgXHJcbiAgICAvL21hcEVsLmNhbGwoZHJhZyk7XHJcbiAgICBcclxuICAgIFxyXG4gICAgdmFyIG1hcCA9IHRoaXM7XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNvbnN0cnVjdEV2ZW50KGV2ZW50KSB7XHJcbiAgICAgICAgLy8gVE9ETzogbWF5YmUgdGhpcyBzaG91bGQgYmUgb2Zmc2V0WC9ZLCBidXQgdGhlbiB3ZSBuZWVkIHRvIGNoYW5nZVxyXG4gICAgICAgIC8vIHpvb21Ub1ZpZXdwb3J0UG9zaXRpb24gdG8gc3VwcG9ydCBjbGljay10by16b29tXHJcbiAgICAgICAgdmFyIHBvcyA9IFtldmVudC5jbGllbnRYLCBldmVudC5jbGllbnRZXVxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBwb3MsXHJcbiAgICAgICAgICAgIGxvY2F0aW9uOiBtYXAuX3Byb2plY3Rpb24uaW52ZXJ0KHBvcyksXHJcbiAgICAgICAgICAgIGV2ZW50OiBldmVudFxyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgbWFwRWwub24oJ2NsaWNrJywgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgLy8gVE9ETzogY2hlY2sgaWYgYW55b25lIGlzIGxpc3RlbmluZywgZWxzZSByZXR1cm4gaW1tZWRpYXRlbHlcclxuICAgICAgICBtYXAuZGlzcGF0Y2hlci5jbGljay5jYWxsKG1hcCwgY29uc3RydWN0RXZlbnQoZDMuZXZlbnQpKTtcclxuICAgIH0pO1xyXG5cclxuICAgIG1hcEVsLm9uKCdtb3VzZWRvd24nLCBmdW5jdGlvbigpIHtcclxuICAgICAgICAvLyBUT0RPOiBjaGVjayBpZiBhbnlvbmUgaXMgbGlzdGVuaW5nLCBlbHNlIHJldHVybiBpbW1lZGlhdGVseVxyXG4gICAgICAgIG1hcC5kaXNwYXRjaGVyLm1vdXNlZG93bi5jYWxsKG1hcCwgY29uc3RydWN0RXZlbnQoZDMuZXZlbnQpKTtcclxuICAgIH0pO1xyXG5cclxuICAgIG1hcEVsLm9uKCdtb3VzZXVwJywgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgLy8gVE9ETzogY2hlY2sgaWYgYW55b25lIGlzIGxpc3RlbmluZywgZWxzZSByZXR1cm4gaW1tZWRpYXRlbHlcclxuICAgICAgICBtYXAuZGlzcGF0Y2hlci5tb3VzZWRvd24uY2FsbChtYXAsIGNvbnN0cnVjdEV2ZW50KGQzLmV2ZW50KSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBtYXBFbC5vbignbW91c2Vtb3ZlJywgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgLy8gVE9ETzogY2hlY2sgaWYgYW55b25lIGlzIGxpc3RlbmluZywgZWxzZSByZXR1cm4gaW1tZWRpYXRlbHlcclxuICAgICAgICBtYXAuZGlzcGF0Y2hlci5tb3VzZWRvd24uY2FsbChtYXAsIGNvbnN0cnVjdEV2ZW50KGQzLmV2ZW50KSk7XHJcbiAgICB9KTtcclxuXHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLmluaXRFdmVudHMgPSBmdW5jdGlvbihlbGVtZW50KSB7XHJcbiAgICB2YXIgbWFwID0gdGhpcztcclxuICAgIC8vIGtlZXAgYXNwZWN0IHJhdGlvIG9uIHJlc2l6ZVxyXG4gICAgZnVuY3Rpb24gcmVzaXplKCkge1xyXG4gICAgXHJcbiAgICAgICAgbWFwLmJvdW5kcyA9IG1hcC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAobWFwLnNldHRpbmdzLmtlZXBBc3BlY3RSYXRpbykge1xyXG4gICAgICAgICAgICB2YXIgd2lkdGggPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnd2lkdGgnKSxcclxuICAgICAgICAgICAgICAgIGhlaWdodCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdoZWlnaHQnKTtcclxuICAgICAgICAgICAgaWYgKHdpZHRoICYmIGhlaWdodCAmJiBtYXAuYm91bmRzLndpZHRoKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgcmF0aW8gPSB3aWR0aCAvIGhlaWdodDtcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gKG1hcC5ib3VuZHMud2lkdGggLyByYXRpbykgKyAncHgnO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICB3aW5kb3cub25yZXNpemUgPSByZXNpemU7XHJcbiAgICBcclxuICAgIHJlc2l6ZSgpO1xyXG59O1xyXG5cclxudmFyIGRvbWFpbiA9IFswLDFdO1xyXG5cclxudmFyIGxheWVyX2NvdW50ZXIgPSAwO1xyXG5cclxuLy8gVE9ETzogdGhpbmsgYWJvdXQgY2FjaGluZyBsb2FkZWQgcmVzb3VyY2VzICgjOClcclxubWFwbWFwLnByb3RvdHlwZS5nZW9tZXRyeSA9IGZ1bmN0aW9uKHNwZWMsIGtleU9yT3B0aW9ucykge1xyXG5cclxuICAgIC8vIGtleSBpcyBkZWZhdWx0IG9wdGlvblxyXG4gICAgdmFyIG9wdGlvbnMgPSBkZC5pc1N0cmluZyhrZXlPck9wdGlvbnMpID8ge2tleToga2V5T3JPcHRpb25zfSA6IGtleU9yT3B0aW9ucztcclxuXHJcbiAgICBvcHRpb25zID0gZGQubWVyZ2Uoe1xyXG4gICAgICAgIGtleTogJ2lkJyxcclxuICAgICAgICBzZXRFeHRlbnQ6IHRydWVcclxuICAgICAgICAvLyBsYXllcnM6IHRha2VuIGZyb20gaW5wdXQgb3IgYXV0by1nZW5lcmF0ZWQgbGF5ZXIgbmFtZVxyXG4gICAgfSwgb3B0aW9ucyk7XHJcblxyXG4gICAgdmFyIG1hcCA9IHRoaXM7XHJcbiAgICBcclxuICAgIGlmIChkZC5pc0Z1bmN0aW9uKHNwZWMpKSB7XHJcbiAgICAgICAgdGhpcy5fcHJvbWlzZS5nZW9tZXRyeS50aGVuKGZ1bmN0aW9uKHRvcG8pe1xyXG4gICAgICAgICAgICB2YXIgbmV3X3RvcG8gPSBzcGVjKHRvcG8pO1xyXG4gICAgICAgICAgICBpZiAodHlwZW9mIG5ld190b3BvLmxlbmd0aCA9PSAndW5kZWZpbmVkJykge1xyXG4gICAgICAgICAgICAgICAgbmV3X3RvcG8gPSBbbmV3X3RvcG9dO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG5ld190b3BvLm1hcChmdW5jdGlvbih0KSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHQuZ2VvbWV0cnkubGVuZ3RoID09ICd1bmRlZmluZWQnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdC5nZW9tZXRyeSA9IFt0Lmdlb21ldHJ5XTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdC5pbmRleCA9PSAndW5kZWZpbmVkJykge1xyXG4gICAgICAgICAgICAgICAgICAgIG1hcC5sYXllcnMucHVzaCh0Lm5hbWUsIHQuZ2VvbWV0cnkpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbWFwLmxheWVycy5pbnNlcnQodC5pbmRleCwgdC5uYW1lLCB0Lmdlb21ldHJ5KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIGlmIChvcHRpb25zLnNldEV4dGVudCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKCFtYXAuc2VsZWN0ZWRfZXh0ZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbWFwLl9leHRlbnQoc3BlYyk7ICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIG1hcC5kcmF3KCk7XHJcbiAgICAgICAgICAgICAgICBpZiAob3B0aW9ucy5vbmRyYXcpIG9wdGlvbnMub25kcmF3KCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuXHJcbiAgICBpZiAoZGQuaXNEaWN0aW9uYXJ5KHNwZWMpKSB7XHJcbiAgICAgICAgaWYgKCFvcHRpb25zLmxheWVycykge1xyXG4gICAgICAgICAgICBvcHRpb25zLmxheWVycyA9ICdsYXllci0nICsgbGF5ZXJfY291bnRlcisrO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBzcGVjID0gW3t0eXBlOidGZWF0dXJlJyxnZW9tZXRyeTpzcGVjfV07XHJcblxyXG4gICAgICAgIG1hcC5sYXllcnMucHVzaChvcHRpb25zLmxheWVycywgc3BlYyk7XHJcbiAgICAgICAgLy8gYWRkIGR1bW15IHByb21pc2UsIHdlIGFyZSBub3QgbG9hZGluZyBhbnl0aGluZ1xyXG4gICAgICAgIHZhciBwcm9taXNlID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XHJcbiAgICAgICAgICAgIHJlc29sdmUoc3BlYyk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgdGhpcy5wcm9taXNlX2RhdGEocHJvbWlzZSk7XHJcbiAgICAgICAgLy8gc2V0IHVwIHByb2plY3Rpb24gZmlyc3QgdG8gYXZvaWQgcmVwcm9qZWN0aW5nIGdlb21ldHJ5XHJcbiAgICAgICAgLy8gVE9ETzogc2V0RXh0ZW50IG9wdGlvbnMgc2hvdWxkIGJlIGRlY291cGxlZCBmcm9tIGRyYXdpbmcsXHJcbiAgICAgICAgLy8gd2UgbmVlZCBhIHdheSB0byBkZWZlciBib3RoIHVudGlsIGRyYXdpbmcgb24gbGFzdCBnZW9tIHByb21pc2Ugd29ya3NcclxuICAgICAgICBpZiAob3B0aW9ucy5zZXRFeHRlbnQpIHtcclxuICAgICAgICAgICAgaWYgKCFtYXAuc2VsZWN0ZWRfZXh0ZW50KSB7XHJcbiAgICAgICAgICAgICAgICBtYXAuX2V4dGVudChzcGVjKTsgICAgICAgICAgIFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG1hcC5kcmF3KCk7XHJcbiAgICAgICAgICAgIGlmIChvcHRpb25zLm9uZHJhdykgb3B0aW9ucy5vbmRyYXcoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGRkLmlzQXJyYXkoc3BlYykpIHtcclxuICAgICAgICAvLyBBcnJheSBjYXNlXHJcbiAgICAgICAgdmFyIG5ld190b3BvID0gZGQubWFwcmVkdWNlKHNwZWMsIG9wdGlvbnMubWFwLCBvcHRpb25zLnJlZHVjZSk7XHJcbiAgICAgICAgaWYgKCFvcHRpb25zLmxheWVycykge1xyXG4gICAgICAgICAgICBvcHRpb25zLmxheWVycyA9ICdsYXllci0nICsgbGF5ZXJfY291bnRlcisrO1xyXG4gICAgICAgIH1cclxuICAgICAgICBtYXAubGF5ZXJzLnB1c2gob3B0aW9ucy5sYXllcnMsIG5ld190b3BvLnZhbHVlcygpKTtcclxuICAgICAgICAvLyBhZGQgZHVtbXkgcHJvbWlzZSwgd2UgYXJlIG5vdCBsb2FkaW5nIGFueXRoaW5nXHJcbiAgICAgICAgdmFyIHByb21pc2UgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcclxuICAgICAgICAgICAgcmVzb2x2ZShuZXdfdG9wbyk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgdGhpcy5wcm9taXNlX2RhdGEocHJvbWlzZSk7XHJcbiAgICAgICAgLy8gc2V0IHVwIHByb2plY3Rpb24gZmlyc3QgdG8gYXZvaWQgcmVwcm9qZWN0aW5nIGdlb21ldHJ5XHJcbiAgICAgICAgaWYgKG9wdGlvbnMuc2V0RXh0ZW50KSB7XHJcbiAgICAgICAgICAgIGlmICghbWFwLnNlbGVjdGVkX2V4dGVudCkge1xyXG4gICAgICAgICAgICAgICAgbWFwLl9leHRlbnQobmV3X3RvcG8udmFsdWVzKCkpOyAgICAgICAgICAgXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgLy8gVE9ETzogd2UgbmVlZCBhIHNtYXJ0ZXIgd2F5IG9mIHNldHRpbmcgdXAgcHJvamVjdGlvbi9ib3VuZGluZyBib3ggaW5pdGlhbGx5XHJcbiAgICAgICAgICAgIC8vIGlmIGV4dGVudCgpIHdhcyBjYWxsZWQsIHRoaXMgc2hvdWxkIGhhdmUgc2V0IHVwIGJvdW5kcywgZWxzZSB3ZSBuZWVkIHRvIGRvIGl0IGhlcmVcclxuICAgICAgICAgICAgLy8gaG93ZXZlciwgZXh0ZW50KCkgY3VycmVudGx5IG9wZXJhdGVzIG9uIHRoZSByZW5kZXJlZCA8cGF0aD5zIGdlbmVyYXRlZCBieSBkcmF3KClcclxuICAgICAgICAgICAgLy8gQWxzbzogZHJhdyBzaG91bGQgYmUgY2FsbGVkIG9ubHkgYXQgZW5kIG9mIHByb21pc2UgY2hhaW4sIG5vdCBpbmJldHdlZW4hXHJcbiAgICAgICAgICAgIC8vdGhpcy5fcHJvbWlzZS5nZW9tZXRyeS50aGVuKGRyYXcpO1xyXG4gICAgICAgICAgICBtYXAuZHJhdygpO1xyXG4gICAgICAgICAgICBpZiAob3B0aW9ucy5vbmRyYXcpIG9wdGlvbnMub25kcmF3KCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBwcm9taXNlID0gZGQubG9hZChzcGVjKTtcclxuXHJcbiAgICAvLyBjaGFpbiB0byBleGlzdGluZyBnZW9tZXRyeSBwcm9taXNlXHJcbiAgICBpZiAodGhpcy5fcHJvbWlzZS5nZW9tZXRyeSkge1xyXG4gICAgICAgIHZhciBwYXJlbnQgPSB0aGlzLl9wcm9taXNlLmdlb21ldHJ5O1xyXG4gICAgICAgIHRoaXMuX3Byb21pc2UuZ2VvbWV0cnkgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcclxuICAgICAgICAgICAgcGFyZW50LnRoZW4oZnVuY3Rpb24oXykge1xyXG4gICAgICAgICAgICAgICAgcHJvbWlzZS50aGVuKGZ1bmN0aW9uKGRhdGEpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGRhdGEpO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgZWxzZSB7XHJcbiAgICAgICAgdGhpcy5fcHJvbWlzZS5nZW9tZXRyeSA9IHByb21pc2U7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRoaXMuX3Byb21pc2UuZ2VvbWV0cnkudGhlbihmdW5jdGlvbihnZW9tKSB7XHJcbiAgICAgICAgaWYgKGdlb20udHlwZSAmJiBnZW9tLnR5cGUgPT0gJ1RvcG9sb2d5Jykge1xyXG4gICAgICAgICAgICAvLyBUb3BvSlNPTlxyXG4gICAgICAgICAgICB2YXIga2V5cyA9IG9wdGlvbnMubGF5ZXJzIHx8IE9iamVjdC5rZXlzKGdlb20ub2JqZWN0cyk7XHJcbiAgICAgICAgICAgIGtleXMubWFwKGZ1bmN0aW9uKGspIHtcclxuICAgICAgICAgICAgICAgIGlmIChnZW9tLm9iamVjdHNba10pIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgb2JqcyA9IHRvcG9qc29uLmZlYXR1cmUoZ2VvbSwgZ2VvbS5vYmplY3RzW2tdKS5mZWF0dXJlcztcclxuICAgICAgICAgICAgICAgICAgICBtYXAubGF5ZXJzLnB1c2goaywgb2Jqcyk7XHJcblx0XHRcdFx0XHQvLyBUT0RPOiBzdXBwb3J0IGZ1bmN0aW9ucyBmb3IgbWFwIGFzIHdlbGwgYXMgc3RyaW5nc1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLmtleSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpPTA7IGk8b2Jqcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIG9iaiA9IG9ianNbaV07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAob2JqLnByb3BlcnRpZXMgJiYgb2JqLnByb3BlcnRpZXNbb3B0aW9ucy5rZXldKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb2Jqc1tpXS5wcm9wZXJ0aWVzLl9fa2V5X18gPSBvYmoucHJvcGVydGllc1tvcHRpb25zLmtleV07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgLy8gR2VvSlNPTlxyXG4gICAgICAgICAgICBpZiAoIW9wdGlvbnMubGF5ZXJzKSB7XHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLmxheWVycyA9ICdsYXllci0nICsgbGF5ZXJfY291bnRlcisrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChnZW9tLmZlYXR1cmVzKSB7XHJcbiAgICAgICAgICAgICAgICBtYXAubGF5ZXJzLnB1c2gob3B0aW9ucy5sYXllcnMsIGdlb20uZmVhdHVyZXMpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgbWFwLmxheWVycy5wdXNoKG9wdGlvbnMubGF5ZXJzLCBbZ2VvbV0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIHNldCB1cCBwcm9qZWN0aW9uIGZpcnN0IHRvIGF2b2lkIHJlcHJvamVjdGluZyBnZW9tZXRyeVxyXG4gICAgICAgIGlmIChvcHRpb25zLnNldEV4dGVudCkge1xyXG4gICAgICAgICAgICBpZiAoIW1hcC5zZWxlY3RlZF9leHRlbnQpIHtcclxuICAgICAgICAgICAgICAgIG1hcC5fZXh0ZW50KGdlb20pOyAgICAgICAgICAgXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gVE9ETzogd2UgbmVlZCBhIHNtYXJ0ZXIgd2F5IG9mIHNldHRpbmcgdXAgcHJvamVjdGlvbi9ib3VuZGluZyBib3ggaW5pdGlhbGx5XHJcbiAgICAgICAgLy8gaWYgZXh0ZW50KCkgd2FzIGNhbGxlZCwgdGhpcyBzaG91bGQgaGF2ZSBzZXQgdXAgYm91bmRzLCBlbHNlIHdlIG5lZWQgdG8gZG8gaXQgaGVyZVxyXG4gICAgICAgIC8vIGhvd2V2ZXIsIGV4dGVudCgpIGN1cnJlbnRseSBvcGVyYXRlcyBvbiB0aGUgcmVuZGVyZWQgPHBhdGg+cyBnZW5lcmF0ZWQgYnkgZHJhdygpXHJcbiAgICAgICAgLy90aGlzLl9wcm9taXNlLmdlb21ldHJ5LnRoZW4oZHJhdyk7XHJcbiAgICAgICAgbWFwLmRyYXcoKTtcclxuICAgICAgICBpZiAob3B0aW9ucy5vbmRyYXcpIG9wdGlvbnMub25kcmF3KCk7XHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgLy8gcHV0IGludG8gY2hhaW5lZCBkYXRhIHByb21pc2UgdG8gbWFrZSBzdXJlIGlzIGxvYWRlZCBiZWZvcmUgbGF0ZXIgZGF0YVxyXG4gICAgLy8gbm90ZSB0aGlzIGhhcyB0byBoYXBwZW4gYWZ0ZXIgbWVyZ2luZyBpbnRvIHRoaXMuX3Byb21pc2UuZ2VvbWV0cnkgdG8gbWFrZVxyXG4gICAgLy8gc3VyZSBsYXllcnMgYXJlIGNyZWF0ZWQgZmlyc3QgKGUuZy4gZm9yIGhpZ2hsaWdodGluZylcclxuICAgIHRoaXMucHJvbWlzZV9kYXRhKHByb21pc2UpO1xyXG4gXHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbnZhciBpZGVudGlmeV9ieV9wcm9wZXJ0aWVzID0gZnVuY3Rpb24ocHJvcGVydGllcyl7XHJcbiAgICAvLyBUT0RPOiBjYWxsaW5nIHRoaXMgd2l0aG91dCBwcm9wZXJ0aWVzIHNob3VsZCB1c2UgcHJpbWFyeSBrZXkgYXMgcHJvcGVydHlcclxuICAgIC8vIGhvd2V2ZXIsIHRoaXMgaXMgbm90IHN0b3JlZCBpbiB0aGUgb2JqZWN0J3MgcHJvcGVydGllcyBjdXJyZW50bHlcclxuICAgIC8vIHNvIHRoZXJlIGlzIG5vIGVhc3kgd2F5IHRvIGFjY2VzcyBpdFxyXG4gICAgaWYgKCFwcm9wZXJ0aWVzKSB7XHJcbiAgICAgICAgcHJvcGVydGllcyA9ICdfX2tleV9fJztcclxuICAgIH1cclxuICAgIC8vIHNpbmdsZSBzdHJpbmcgY2FzZVxyXG4gICAgaWYgKHByb3BlcnRpZXMuc3Vic3RyKSB7XHJcbiAgICAgICAgcHJvcGVydGllcyA9IFtwcm9wZXJ0aWVzXTtcclxuICAgIH1cclxuICAgIHJldHVybiBmdW5jdGlvbihsYXllcnMsIG5hbWUpe1xyXG4gICAgICAgIG5hbWUgPSBuYW1lLnRvU3RyaW5nKCkudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICAvLyBsYXllcnMgaGF2ZSBwcmlvcml0eSwgc28gaXRlcmF0ZSB0aGVtIGZpcnN0XHJcbiAgICAgICAgdmFyIGx5ciA9IGxheWVycy5nZXQobmFtZSk7XHJcbiAgICAgICAgaWYgKGx5cikgcmV0dXJuIGx5cjtcclxuICAgICAgICB2YXIgcmVzdWx0ID0gW107XHJcbiAgICAgICAgLy8gcHJvcGVydGllcyBhcmUgb3JkZXJlZCBieSByZWxldmFuY2UsIHNvIGl0ZXJhdGUgdGhlc2UgZmlyc3RcclxuICAgICAgICBmb3IgKHZhciBrPTA7IGs8cHJvcGVydGllcy5sZW5ndGg7IGsrKykge1xyXG4gICAgICAgICAgICB2YXIgcHJvcGVydHkgPSBwcm9wZXJ0aWVzW2tdO1xyXG4gICAgICAgICAgICBmb3IgKHZhciBpPTA7IGk8bGF5ZXJzLmxlbmd0aCgpOyBpKyspIHtcclxuICAgICAgICAgICAgICAgIHZhciBrZXkgPSBsYXllcnMua2V5cygpW2ldLFxyXG4gICAgICAgICAgICAgICAgICAgIGdlb21zID0gbGF5ZXJzLmdldChrZXkpO1xyXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaj0wOyBqPGdlb21zLmxlbmd0aDsgaisrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIGdlb20gPSBnZW9tc1tqXTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZ2VvbS5wcm9wZXJ0aWVzICYmIGdlb20ucHJvcGVydGllc1twcm9wZXJ0eV0gIT09IHVuZGVmaW5lZCAmJiBnZW9tLnByb3BlcnRpZXNbcHJvcGVydHldLnRvU3RyaW5nKCkudG9Mb3dlckNhc2UoKSA9PSBuYW1lKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGdlb20pO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfTtcclxufTtcclxuXHJcbnZhciBpZGVudGlmeV9sYXllciA9IGZ1bmN0aW9uKGxheWVycywgbmFtZSkge1xyXG4gICAgbmFtZSA9IG5hbWUudG9Mb3dlckNhc2UoKTtcclxuICAgIHJldHVybiBsYXllcnMuZ2V0KG5hbWUpO1xyXG59O1xyXG5cclxuLy8gVE9ETzogdXNlIGFsbCBhcmd1bWVudHMgdG8gaWRlbnRpZnkgLSBjYW4gYmUgdXNlZCB0byBwcm92aWRlIG11bHRpcGxlIHByb3BlcnRpZXMgb3IgZnVuY3Rpb25zXHJcbm1hcG1hcC5wcm90b3R5cGUuaWRlbnRpZnkgPSBmdW5jdGlvbihzcGVjKSB7XHJcbiAgICBpZiAodHlwZW9mIHNwZWMgPT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIHRoaXMuaWRlbnRpZnlfZnVuYyA9IHNwZWM7XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcbiAgICAvLyBjYXN0IHRvIGFycmF5XHJcbiAgICBpZiAoIXNwZWMuc2xpY2UpIHtcclxuICAgICAgICBzcGVjID0gW3NwZWNdO1xyXG4gICAgfVxyXG4gICAgdGhpcy5pZGVudGlmeV9mdW5jID0gaWRlbnRpZnlfYnlfcHJvcGVydGllcyhzcGVjKTtcclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5zZWFyY2hBZGFwdGVyID0gZnVuY3Rpb24oc2VsZWN0aW9uLCBwcm9wTmFtZSkge1xyXG4gICAgdmFyIG1hcCA9IHRoaXM7XHJcbiAgICByZXR1cm4gZnVuY3Rpb24ocXVlcnksIGNhbGxiYWNrKSB7XHJcbiAgICAgICAgbWFwLnByb21pc2VfZGF0YSgpLnRoZW4oZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIHZhciBzZWwgPSBtYXAuZ2V0UmVwcmVzZW50YXRpb25zKHNlbGVjdGlvbiksXHJcbiAgICAgICAgICAgICAgICByZXN1bHRzID0gW107XHJcbiAgICAgICAgICAgIHNlbCA9IHNlbFswXTtcclxuICAgICAgICAgICAgZm9yICh2YXIgaT0wOyBpPHNlbC5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgdmFyIGQgPSBzZWxbaV0uX19kYXRhX18ucHJvcGVydGllcztcclxuICAgICAgICAgICAgICAgIGlmIChkW3Byb3BOYW1lXSAmJiBkW3Byb3BOYW1lXS50b0xvd2VyQ2FzZSgpLmluZGV4T2YocXVlcnkudG9Mb3dlckNhc2UoKSkgPT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdHMucHVzaChzZWxbaV0uX19kYXRhX18pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNhbGxiYWNrKHJlc3VsdHMpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfTtcclxufTtcclxuXHJcbi8vIFRPRE86IHRoaXMgaXMgbmVlZGVkIGZvciBzZWFyY2ggZnVuY3Rpb25hbGl0eSAoc2VlIHRvb2xzLmpzKSAtIGdlbmVyYWxpemUgYW5kIGludGVncmF0ZVxyXG4vLyBpbnRvIGlkZW50aWZ5KCkgZXRjLlxyXG5tYXBtYXAucHJvdG90eXBlLnNlYXJjaCA9IGZ1bmN0aW9uKHZhbHVlLCBrZXkpIHtcclxuICAgIGtleSA9IGtleSB8fCAnX19rZXlfXyc7XHJcbiAgICByZXR1cm4gaWRlbnRpZnlfYnlfcHJvcGVydGllcyhba2V5XSkodGhpcy5sYXllcnMsIHZhbHVlKTtcclxufTtcclxuXHJcbi8vIHJldHVybiB0aGUgcmVwcmVzZW50YXRpb24gKD0gU1ZHIGVsZW1lbnQpIG9mIGEgZ2l2ZW4gb2JqZWN0XHJcbm1hcG1hcC5wcm90b3R5cGUucmVwciA9IGZ1bmN0aW9uKGQpIHtcclxuICAgIHJldHVybiBkLl9fcmVwcl9fO1xyXG59O1xyXG5cclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuZHJhdyA9IGZ1bmN0aW9uKCkge1xyXG5cclxuICAgIHZhciBncm91cFNlbCA9IHRoaXMuX2VsZW1lbnRzLmdlb21ldHJ5XHJcbiAgICAgICAgLnNlbGVjdEFsbCgnZycpXHJcbiAgICAgICAgLmRhdGEodGhpcy5sYXllcnMua2V5cygpLCBmdW5jdGlvbihkLGkpIHsgcmV0dXJuIGQ7IH0pO1xyXG4gICAgXHJcbiAgICB2YXIgbWFwID0gdGhpcztcclxuICAgIFxyXG4gICAgdmFyIHBhdGhHZW5lcmF0b3IgPSBkMy5nZW8ucGF0aCgpLnByb2plY3Rpb24odGhpcy5fcHJvamVjdGlvbik7XHJcblxyXG4gICAgaWYgKHRoaXMuX2VsZW1lbnRzLnBsYWNlaG9sZGVyKSB7XHJcbiAgICAgICAgdGhpcy5fZWxlbWVudHMucGxhY2Vob2xkZXIucmVtb3ZlKCk7XHJcbiAgICAgICAgdGhpcy5fZWxlbWVudHMucGxhY2Vob2xkZXIgPSBudWxsO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBncm91cFNlbC5lbnRlcigpXHJcbiAgICAgICAgLmFwcGVuZCgnZycpXHJcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgZnVuY3Rpb24oZCl7XHJcbiAgICAgICAgICAgIHJldHVybiBkO1xyXG4gICAgICAgIH0pXHJcbiAgICAgICAgLmVhY2goZnVuY3Rpb24oZCkge1xyXG4gICAgICAgICAgICAvLyBkIGlzIG5hbWUgb2YgdG9wb2xvZ3kgb2JqZWN0XHJcbiAgICAgICAgICAgIHZhciBnZW9tID0gbWFwLmxheWVycy5nZXQoZCk7XHJcbiAgICAgICAgICAgIHZhciBnZW9tU2VsID0gZDMuc2VsZWN0KHRoaXMpXHJcbiAgICAgICAgICAgICAgICAuc2VsZWN0QWxsKCdwYXRoJylcclxuICAgICAgICAgICAgICAgIC5kYXRhKGdlb20pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgZ2VvbVNlbFxyXG4gICAgICAgICAgICAgICAgLmVudGVyKClcclxuICAgICAgICAgICAgICAgIC5hcHBlbmQoJ3BhdGgnKVxyXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2QnLCBwYXRoR2VuZXJhdG9yKVxyXG4gICAgICAgICAgICAgICAgLmF0dHIobWFwLnNldHRpbmdzLnBhdGhBdHRyaWJ1dGVzKVxyXG4gICAgICAgICAgICAgICAgLmVhY2goZnVuY3Rpb24oZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIGxpbmsgZGF0YSBvYmplY3QgdG8gaXRzIHJlcHJlc2VudGF0aW9uXHJcbiAgICAgICAgICAgICAgICAgICAgZC5fX3JlcHJfXyA9IHRoaXM7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgIFxyXG4gICAgZ3JvdXBTZWwub3JkZXIoKTtcclxufTtcclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuYW5jaG9yRnVuY3Rpb24gPSBmdW5jdGlvbihmKSB7XHJcbiAgICB0aGlzLmFuY2hvckYgPSBmO1xyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLmFuY2hvciA9IGZ1bmN0aW9uKGQpIHtcclxuICAgIGlmICh0aGlzLmFuY2hvckYpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5hbmNob3JGKGQpO1xyXG4gICAgfVxyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5zaXplID0gZnVuY3Rpb24oKSB7XHJcbiAgICAvLyBib3VuZHMgYXJlIHJlLWNhbGN1bGF0ZSBieSBpbml0RXZlbnRzIG9uIGV2ZXJ5IHJlc2l6ZVxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB3aWR0aDogdGhpcy53aWR0aCxcclxuICAgICAgICBoZWlnaHQ6IHRoaXMuaGVpZ2h0XHJcbiAgICB9O1xyXG59O1xyXG5cclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuZ2V0Qm91bmRpbmdDbGllbnRSZWN0ID0gZnVuY3Rpb24oKSB7XHJcblxyXG4gICAgdmFyIGVsID0gdGhpcy5fZWxlbWVudHMubWFpbi5ub2RlKCksXHJcbiAgICAgICAgYm91bmRzID0gZWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICBcclxuICAgIGlmICh0aGlzLnN1cHBvcnRzLnN2Z0dldEJvdW5kaW5nQ2xpZW50UmVjdCkge1xyXG4gICAgICAgIHJldHVybiBib3VuZHM7XHJcbiAgICB9XHJcbiAgICAgICAgXHJcbiAgICAvLyBGaXggZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkgZm9yIEZpcmVmb3ggPCAzNVxyXG4gICAgLy8gaHR0cHM6Ly9idWd6aWxsYS5tb3ppbGxhLm9yZy9zaG93X2J1Zy5jZ2k/aWQ9NTMwOTg1XHJcbiAgICAvLyBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzIzNjg0ODIxL2NhbGN1bGF0ZS1zaXplLW9mLXN2Zy1lbGVtZW50LWluLWh0bWwtcGFnZVxyXG4gICAgdmFyIGNzID0gZ2V0Q29tcHV0ZWRTdHlsZShlbCksXHJcbiAgICAgICAgcGFyZW50T2Zmc2V0ID0gZWwucGFyZW50Tm9kZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSxcclxuICAgICAgICBsZWZ0ID0gcGFyZW50T2Zmc2V0LmxlZnQsXHJcbiAgICAgICAgc2Nyb2xsVG9wID0gd2luZG93LnBhZ2VZT2Zmc2V0IHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zY3JvbGxUb3AgfHwgZG9jdW1lbnQuYm9keS5zY3JvbGxUb3AgfHwgMCxcclxuICAgICAgICBzY3JvbGxMZWZ0ID0gd2luZG93LnBhZ2VYT2Zmc2V0IHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zY3JvbGxMZWZ0IHx8IGRvY3VtZW50LmJvZHkuc2Nyb2xsTGVmdCB8fCAwXHJcbiAgICA7XHJcbiAgICAvLyBUT0RPOiB0YWtlIGludG8gYWNjb3VudCBtYXJnaW5zIGV0Yy5cclxuICAgIGlmIChjcy5sZWZ0LmluZGV4T2YoJ3B4JykgPiAtMSkge1xyXG4gICAgICAgIGxlZnQgKz0gcGFyc2VJbnQoY3MubGVmdC5zbGljZSgwLC0yKSk7XHJcbiAgICB9XHJcbiAgICAvLyB0aGlzIHRlc3RzIGdldEJvdW5kaW5nQ2xpZW50UmVjdCgpIHRvIGJlIG5vbi1idWdneVxyXG4gICAgaWYgKGJvdW5kcy5sZWZ0ID09IGxlZnQgLSBzY3JvbGxMZWZ0KSB7XHJcbiAgICAgICAgcmV0dXJuIGJvdW5kcztcclxuICAgIH1cclxuICAgIC8vIGNvbnN0cnVjdCBzeW50aGV0aWMgYm91bmRpbmdib3ggZnJvbSBjb21wdXRlZCBzdHlsZVxyXG4gICAgdmFyIHRvcCA9IHBhcmVudE9mZnNldC50b3AsXHJcbiAgICAgICAgd2lkdGggPSBwYXJzZUludChjcy53aWR0aC5zbGljZSgwLC0yKSksXHJcbiAgICAgICAgaGVpZ2h0ID0gcGFyc2VJbnQoY3MuaGVpZ2h0LnNsaWNlKDAsLTIpKTtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgbGVmdDogbGVmdCAtIHNjcm9sbExlZnQsXHJcbiAgICAgICAgdG9wOiB0b3AgLSBzY3JvbGxUb3AsXHJcbiAgICAgICAgd2lkdGg6IHdpZHRoLFxyXG4gICAgICAgIGhlaWdodDogaGVpZ2h0LFxyXG4gICAgICAgIHJpZ2h0OiBsZWZ0ICsgd2lkdGggLSBzY3JvbGxMZWZ0LFxyXG4gICAgICAgIGJvdHRvbTogdG9wICsgaGVpZ2h0IC0gc2Nyb2xsVG9wXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLy8gVE9ETzogZGlzYWJsZSBwb2ludGVyLWV2ZW50cyBmb3Igbm90IHNlbGVjdGVkIHBhdGhzXHJcbm1hcG1hcC5wcm90b3R5cGUuc2VsZWN0ID0gZnVuY3Rpb24oc2VsZWN0aW9uKSB7XHJcblxyXG4gICAgdmFyIG1hcCA9IHRoaXM7XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGdldE5hbWUoc2VsKSB7XHJcbiAgICAgICAgcmV0dXJuICh0eXBlb2Ygc2VsID09ICdzdHJpbmcnKSA/IHNlbCA6IChzZWwuc2VsZWN0aW9uTmFtZSB8fCAnZnVuY3Rpb24nKTtcclxuICAgIH1cclxuICAgIHZhciBvbGRTZWwgPSB0aGlzLnNlbGVjdGVkO1xyXG4gICAgaWYgKHRoaXMuc2VsZWN0ZWQpIHtcclxuICAgICAgICB0aGlzLl9lbGVtZW50cy5tYWluLmNsYXNzZWQoJ3NlbGVjdGVkLScgKyBnZXROYW1lKHRoaXMuc2VsZWN0ZWQpLCBmYWxzZSk7XHJcbiAgICB9XHJcbiAgICB0aGlzLnNlbGVjdGVkID0gc2VsZWN0aW9uO1xyXG4gICAgaWYgKHRoaXMuc2VsZWN0ZWQpIHtcclxuICAgICAgICB0aGlzLl9lbGVtZW50cy5tYWluLmNsYXNzZWQoJ3NlbGVjdGVkLScgKyBnZXROYW1lKHRoaXMuc2VsZWN0ZWQpLCB0cnVlKTtcclxuICAgIH1cclxuICAgIHRoaXMucHJvbWlzZV9kYXRhKCkudGhlbihmdW5jdGlvbigpe1xyXG4gICAgICAgIGlmIChvbGRTZWwpIHtcclxuICAgICAgICAgICAgbWFwLmdldFJlcHJlc2VudGF0aW9ucyhvbGRTZWwpLmNsYXNzZWQoJ3NlbGVjdGVkJyxmYWxzZSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChzZWxlY3Rpb24pIHtcclxuICAgICAgICAgICAgbWFwLmdldFJlcHJlc2VudGF0aW9ucyhzZWxlY3Rpb24pLmNsYXNzZWQoJ3NlbGVjdGVkJyx0cnVlKTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5oaWdobGlnaHQgPSBmdW5jdGlvbihzZWxlY3Rpb24pIHtcclxuXHJcbiAgICB2YXIgbWFwID0gdGhpcztcclxuICAgICAgIFxyXG4gICAgaWYgKHNlbGVjdGlvbiA9PT0gbnVsbCkge1xyXG4gICAgICAgIG1hcC5fZWxlbWVudHMuc2hhZG93RWwuc2VsZWN0QWxsKCdwYXRoJykucmVtb3ZlKCk7XHJcbiAgICAgICAgbWFwLl9lbGVtZW50cy5zaGFkb3dDcm9wRWwuc2VsZWN0QWxsKCdwYXRoJykucmVtb3ZlKCk7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgICB0aGlzLnByb21pc2VfZGF0YSgpLnRoZW4oZnVuY3Rpb24oZGF0YSkgeyAgICAgIFxyXG4gICAgICAgICAgICB2YXIgb2JqID0gbWFwLmdldFJlcHJlc2VudGF0aW9ucyhzZWxlY3Rpb24pO1xyXG4gICAgICAgICAgICBtYXAuX2VsZW1lbnRzLnNoYWRvd0VsLnNlbGVjdEFsbCgncGF0aCcpLnJlbW92ZSgpO1xyXG4gICAgICAgICAgICBtYXAuX2VsZW1lbnRzLnNoYWRvd0Nyb3BFbC5zZWxlY3RBbGwoJ3BhdGgnKS5yZW1vdmUoKTtcclxuICAgICAgICAgICAgb2JqLmVhY2goZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICBtYXAuX2VsZW1lbnRzLnNoYWRvd0VsLmFwcGVuZCgncGF0aCcpXHJcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBkOiB0aGlzLmF0dHJpYnV0ZXMuZC52YWx1ZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmlsbDogJ3JnYmEoMCwwLDAsMC41KScgLy8nIzk5OSdcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIG1hcC5fZWxlbWVudHMuc2hhZG93Q3JvcEVsLmFwcGVuZCgncGF0aCcpXHJcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBkOiB0aGlzLmF0dHJpYnV0ZXMuZC52YWx1ZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmlsbDogJyNmZmYnXHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG4vKlxyXG5DYWxsIHdpdGhvdXQgcGFyYW1ldGVycyB0byBnZXQgY3VycmVudCBzZWxlY3Rpb24uXHJcbkNhbGwgd2l0aCBudWxsIHRvIGdldCBhbGwgdG9wb2xvZ3kgb2JqZWN0cy5cclxuQ2FsbCB3aXRoIGZ1bmN0aW9uIHRvIGZpbHRlciBnZW9tZXRyaWVzLlxyXG5DYWxsIHdpdGggc3RyaW5nIHRvIGZpbHRlciBnZW9tZXRyaWVzL2xheWVycyBiYXNlZCBvbiBpZGVudGlmeSgpLlxyXG5DYWxsIHdpdGggZ2VvbWV0cnkgdG8gY29udmVydCBpbnRvIGQzIHNlbGVjdGlvbi5cclxuXHJcblJldHVybnMgYSBEMyBzZWxlY3Rpb24uXHJcbiovXHJcbm1hcG1hcC5wcm90b3R5cGUuZ2V0UmVwcmVzZW50YXRpb25zID0gZnVuY3Rpb24oc2VsZWN0aW9uKSB7XHJcbiAgICBpZiAodHlwZW9mIHNlbGVjdGlvbiA9PSAndW5kZWZpbmVkJykge1xyXG4gICAgICAgIHNlbGVjdGlvbiA9IHRoaXMuc2VsZWN0ZWQ7XHJcbiAgICB9XHJcbiAgICBpZiAoc2VsZWN0aW9uKSB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiBzZWxlY3Rpb24gPT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fZWxlbWVudHMuZ2VvbWV0cnkuc2VsZWN0QWxsKCdwYXRoJykuZmlsdGVyKGZ1bmN0aW9uKGQsaSl7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gc2VsZWN0aW9uKGQucHJvcGVydGllcyk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoc2VsZWN0aW9uLl9fZGF0YV9fKSB7XHJcbiAgICAgICAgICAgIC8vIGlzIGEgZ2VvbWV0cnkgZ2VuZXJhdGVkIGJ5IGQzIC0+IHJldHVybiBzZWxlY3Rpb25cclxuICAgICAgICAgICAgcmV0dXJuIGQzLnNlbGVjdChzZWxlY3Rpb24pO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBUT0RPOiB0aGlzIHNob3VsZCBoYXZlIGEgbmljZXIgQVBJXHJcbiAgICAgICAgdmFyIG9iaiA9IHRoaXMuaWRlbnRpZnlfZnVuYyh0aGlzLmxheWVycywgc2VsZWN0aW9uKTtcclxuICAgICAgICBpZiAoIW9iaikgcmV0dXJuIGQzLnNlbGVjdChudWxsKTtcclxuICAgICAgICAvLyBsYXllciBjYXNlXHJcbiAgICAgICAgaWYgKG9iai5sZW5ndGgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGQzLnNlbGVjdEFsbChvYmoubWFwKGZ1bmN0aW9uKGQpe3JldHVybiBkLl9fcmVwcl9fO30pKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gb2JqZWN0IGNhc2VcclxuICAgICAgICByZXR1cm4gZDMuc2VsZWN0KG9iai5fX3JlcHJfXyk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcy5fZWxlbWVudHMuZ2VvbWV0cnkuc2VsZWN0QWxsKCdwYXRoJyk7XHJcbn07XHJcblxyXG4vLyBUT0RPOiB0aGlzIGlzIGFuIHVnbHkgaGFjayBmb3Igbm93LCB1bnRpbCB3ZSBwcm9wZXJseSBrZWVwIHRyYWNrIG9mIGN1cnJlbnQgbWVyZ2VkIGRhdGEhXHJcbm1hcG1hcC5wcm90b3R5cGUuZ2V0RGF0YSA9IGZ1bmN0aW9uKGtleSwgc2VsZWN0aW9uKSB7XHJcblxyXG4gICAgdmFyIG1hcCA9IHRoaXM7XHJcbiAgICBcclxuICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcclxuICAgICAgICBtYXAuX3Byb21pc2UuZGF0YS50aGVuKGZ1bmN0aW9uKGRhdGEpIHtcclxuICAgICAgICBcclxuICAgICAgICAgICAgZGF0YSA9IGRkLk9yZGVyZWRIYXNoKCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBtYXAuZ2V0UmVwcmVzZW50YXRpb25zKHNlbGVjdGlvbilbMF0uZm9yRWFjaChmdW5jdGlvbihkKXtcclxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgZC5fX2RhdGFfXy5wcm9wZXJ0aWVzW2tleV0gIT0gJ3VuZGVmaW5lZCcpIHtcclxuICAgICAgICAgICAgICAgICAgICBkYXRhLnB1c2goZC5fX2RhdGFfXy5wcm9wZXJ0aWVzW2tleV0sIGQuX19kYXRhX18ucHJvcGVydGllcyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmVzb2x2ZShkYXRhKTtcclxuICAgICAgICB9KTtcclxuICAgIH0pO1xyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5nZXRPdmVybGF5Q29udGV4dCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHRoaXMuX2VsZW1lbnRzLm92ZXJsYXk7XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLnByb2plY3QgPSBmdW5jdGlvbihwb2ludCkge1xyXG4gICAgcmV0dXJuIHRoaXMuX3Byb2plY3Rpb24ocG9pbnQpO1xyXG59O1xyXG5cclxuXHJcbm1hcG1hcC5wcm90b3R5cGUucHJvbWlzZV9kYXRhID0gZnVuY3Rpb24ocHJvbWlzZSkge1xyXG4gICAgLy8gY2hhaW4gYSBuZXcgcHJvbWlzZSB0byB0aGUgZGF0YSBwcm9taXNlXHJcbiAgICAvLyB0aGlzIGFsbG93cyBhIG1vcmUgZWxlZ2FudCBBUEkgdGhhbiBQcm9taXNlLmFsbChbcHJvbWlzZXNdKVxyXG4gICAgLy8gc2luY2Ugd2UgdXNlIG9ubHkgYSBzaW5nbGUgcHJvbWlzZSB0aGUgXCJlbmNhcHN1bGF0ZXNcIiB0aGVcclxuICAgIC8vIHByZXZpb3VzIG9uZXNcclxuICAgIFxyXG4gICAgLy8gVE9ETzogaGlkZSB0aGlzLl9wcm9taXNlLmRhdGEgdGhyb3VnaCBhIGNsb3N1cmU/XHJcbiAgICBcclxuICAgIC8vIFRPRE86IHdlIG9ubHkgZnVsZmlsbCB3aXRoIG1vc3QgcmVjZW50IGRhdGEgLSBzaG91bGRcclxuICAgIC8vIHdlIG5vdCAqYWx3YXlzKiBmdWxmaWxsIHdpdGggY2Fub25pY2FsIGRhdGEgaS5lLiB0aGVcclxuICAgIC8vIHVuZGVybHlpbmcgc2VsZWN0aW9uLCBvciBrZWVwIGNhbm9uaWNhbCBkYXRhIGFuZCByZWZyZXNoXHJcbiAgICAvLyBzZWxlY3Rpb24gYWx3YXlzP1xyXG4gICAgLy8gQWxzbywgd2UgbmVlZCB0byBrZWVwIGRhdGEgdGhhdCBoYXMgbm8gZW50aXRpZXMgaW4gdGhlIGdlb21ldHJ5XHJcbiAgICAvLyBlLmcuIGZvciBsb2FkaW5nIHN0YXRzIG9mIGFnZ3JlZ2F0ZWQgZW50aXRpZXMuIFdlIGNvdWxkXHJcbiAgICAvLyB1c2UgYSBnbG9iYWwgYXJyYXkgb2YgR2VvSlNPTiBmZWF0dXJlcywgYXMgdGhpcyBhbGxvd3NcclxuICAgIC8vIGVpdGhlciBnZW9tZXRyeSBvciBwcm9wZXJ0aWVzIHRvIGJlIG51bGwgLS0gZmwgMjAxNS0xMS0yMVxyXG5cclxuICAgIHZhciBtYXAgPSB0aGlzO1xyXG4gICAgXHJcbiAgICBpZiAocHJvbWlzZSkge1xyXG4gICAgICAgIGlmICh0aGlzLl9wcm9taXNlLmRhdGEpIHtcclxuICAgICAgICAgICAgdGhpcy5fcHJvbWlzZS5kYXRhID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XHJcbiAgICAgICAgICAgICAgICBtYXAuX3Byb21pc2UuZGF0YS50aGVuKGZ1bmN0aW9uKF8pIHtcclxuICAgICAgICAgICAgICAgICAgICBwcm9taXNlLnRoZW4oZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGRhdGEpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5fcHJvbWlzZS5kYXRhID0gcHJvbWlzZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcy5fcHJvbWlzZS5kYXRhOyAgIFxyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS50aGVuID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcclxuICAgIHRoaXMucHJvbWlzZV9kYXRhKCkudGhlbihjYWxsYmFjayk7XHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbi8vIFRPRE86IHRoaW5rIGFib3V0IGNhY2hpbmcgbG9hZGVkIHJlc291cmNlcyAoIzgpXHJcbm1hcG1hcC5wcm90b3R5cGUuZGF0YSA9IGZ1bmN0aW9uKHNwZWMsIGtleU9yT3B0aW9ucykge1xyXG5cclxuICAgIHZhciBvcHRpb25zID0gZGQuaXNEaWN0aW9uYXJ5KGtleU9yT3B0aW9ucykgPyBrZXlPck9wdGlvbnMgOiB7bWFwOiBrZXlPck9wdGlvbnN9O1xyXG4gICAgXHJcbiAgICBvcHRpb25zID0gZGQubWVyZ2Uoe1xyXG4gICAgICAgIGdlb21ldHJ5S2V5OiAnX19rZXlfXycgLy8gbmF0dXJhbCBrZXlcclxuICAgICAgICAvLyBtYXA6IGRhdGRhdGEgZGVmYXVsdFxyXG4gICAgICAgIC8vIHJlZHVjZTogZGF0ZGF0YSBkZWZhdWx0XHJcbiAgICB9LCBvcHRpb25zKTtcclxuICAgICAgICBcclxuICAgIHZhciBtYXAgPSB0aGlzO1xyXG4gICAgXHJcbiAgICBpZiAodHlwZW9mIHNwZWMgPT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIHRoaXMucHJvbWlzZV9kYXRhKCkudGhlbihmdW5jdGlvbihkYXRhKXtcclxuICAgICAgICAgICAgLy8gVE9ETzogdGhpcyBpcyBhIG1lc3MsIHNlZSBhYm92ZSAtIGRhdGFcclxuICAgICAgICAgICAgLy8gZG9lc24ndCBjb250YWluIHRoZSBhY3R1YWwgY2Fub25pY2FsIGRhdGEsIGJ1dCBcclxuICAgICAgICAgICAgLy8gb25seSB0aGUgbW9zdCByZWNlbnRseSByZXF1ZXN0ZWQgb25lLCB3aGljaCBkb2Vzbid0XHJcbiAgICAgICAgICAgIC8vIGhlbHAgdXMgZm9yIHRyYW5zZm9ybWF0aW9uc1xyXG4gICAgICAgICAgICBtYXAuX2VsZW1lbnRzLmdlb21ldHJ5LnNlbGVjdEFsbCgncGF0aCcpXHJcbiAgICAgICAgICAgIC5lYWNoKGZ1bmN0aW9uKGdlb20pIHtcclxuICAgICAgICAgICAgICAgIGlmIChnZW9tLnByb3BlcnRpZXMpIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgdmFsID0gc3BlYyhnZW9tLnByb3BlcnRpZXMpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWwpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbWFwbWFwLmV4dGVuZChnZW9tLnByb3BlcnRpZXMsIHZhbCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICAgIHRoaXMucHJvbWlzZV9kYXRhKGRkKHNwZWMsIG9wdGlvbnMubWFwLCBvcHRpb25zLnJlZHVjZSwgb3B0aW9ucykpXHJcbiAgICAgICAgLnRoZW4oZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgICAgICAgICBpZiAoZGF0YS5sZW5ndGgoKSA9PSAwKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oXCJEYXRhIGZvciBrZXkgJ1wiICsgb3B0aW9ucy5tYXAgKyBcIicgeWllbGRlZCBubyByZXN1bHRzIVwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBtYXAuX2VsZW1lbnRzLmdlb21ldHJ5LnNlbGVjdEFsbCgncGF0aCcpXHJcbiAgICAgICAgICAgICAgICAuZWFjaChmdW5jdGlvbihkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGQucHJvcGVydGllcykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgayA9IGQucHJvcGVydGllc1tvcHRpb25zLmdlb21ldHJ5S2V5XTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGspIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1hcG1hcC5leHRlbmQoZC5wcm9wZXJ0aWVzLCBkYXRhLmdldChrKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvL2NvbnNvbGUud2FybihcIktleSAnXCIgKyBvcHRpb25zLmdlb21ldHJ5S2V5ICsgXCInIG5vdCBmb3VuZCBpbiBcIiArIHRoaXMgKyBcIiFcIik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gICAgXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbnZhciBNZXRhRGF0YVNwZWMgPSBmdW5jdGlvbihrZXksIGZpZWxkcykge1xyXG4gICAgLy8gZW5zdXJlIGNvbnN0cnVjdG9yIGludm9jYXRpb25cclxuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBNZXRhRGF0YVNwZWMpKSByZXR1cm4gbmV3IE1ldGFEYXRhU3BlYyhrZXksIGZpZWxkcyk7XHJcbiAgICBtYXBtYXAuZXh0ZW5kKHRoaXMsIGZpZWxkcyk7XHJcbiAgICB0aGlzLmtleSA9IGtleTtcclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG5NZXRhRGF0YVNwZWMucHJvdG90eXBlLnNwZWNpZmljaXR5ID0gZnVuY3Rpb24oKSB7XHJcbiAgICAvLyByZWdleCBjYXNlLiB1c2UgbGVuZ3RoIG9mIHN0cmluZyByZXByZXNlbnRhdGlvbiB3aXRob3V0IGVuY2xvc2luZyAvLi4uL1xyXG4gICAgaWYgKHRoaXMua2V5IGluc3RhbmNlb2YgUmVnRXhwKSByZXR1cm4gdGhpcy5rZXkudG9TdHJpbmcoKS0yO1xyXG4gICAgLy8gcmV0dXJuIG51bWJlciBvZiBzaWduaWZpY2FudCBsZXR0ZXJzXHJcbiAgICByZXR1cm4gdGhpcy5rZXkubGVuZ3RoIC0gKHRoaXMua2V5Lm1hdGNoKC9bXFwqXFw/XS9nKSB8fCBbXSkubGVuZ3RoO1xyXG59O1xyXG5NZXRhRGF0YVNwZWMucHJvdG90eXBlLm1hdGNoID0gZnVuY3Rpb24oc3RyKSB7XHJcbiAgICBpZiAodGhpcy5rZXkgaW5zdGFuY2VvZiBSZWdFeHApIHJldHVybiAoc3RyLnNlYXJjaCh0aGlzLmtleSkgPT0gMCk7XHJcbiAgICB2YXIgcmV4ID0gbmV3IFJlZ0V4cCgnXicgKyB0aGlzLmtleS5yZXBsYWNlKCcqJywnLionKS5yZXBsYWNlKCc/JywnLicpKTtcclxuICAgIHJldHVybiAoc3RyLnNlYXJjaChyZXgpID09IDApO1xyXG59O1xyXG52YXIgTWV0YURhdGEgPSBmdW5jdGlvbihmaWVsZHMsIGxvY2FsZVByb3ZpZGVyKSB7XHJcbiAgICAvLyBlbnN1cmUgY29uc3RydWN0b3IgaW52b2NhdGlvblxyXG4gICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIE1ldGFEYXRhKSkgcmV0dXJuIG5ldyBNZXRhRGF0YShmaWVsZHMsIGxvY2FsZVByb3ZpZGVyKTtcclxuICAgIG1hcG1hcC5leHRlbmQodGhpcywgZmllbGRzKTtcclxuICAgIC8vIHRha2UgZGVmYXVsdCBmcm9tIGxvY2FsZVxyXG4gICAgaWYgKCF0aGlzLnVuZGVmaW5lZExhYmVsKSB0aGlzLnVuZGVmaW5lZExhYmVsID0gbG9jYWxlUHJvdmlkZXIubG9jYWxlLnVuZGVmaW5lZExhYmVsO1xyXG4gICAgXHJcbiAgICB0aGlzLmZvcm1hdCA9IGZ1bmN0aW9uKHZhbCkge1xyXG4gICAgICAgIGlmICghdGhpcy5fZm9ybWF0KSB7XHJcbiAgICAgICAgICAgIHRoaXMuX2Zvcm1hdCA9IHRoaXMuZ2V0Rm9ybWF0dGVyKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIHJldHVybiB1bmRlZmluZWQgaWYgdW5kZWZpbmVkIG9yIGlmIG5vdCBhIG51bWJlciBidXQgbnVtYmVyIGZvcm1hdHRpbmcgZXhwbGljaXRseSByZXF1ZXN0ZWRcclxuICAgICAgICBpZiAodmFsID09PSB1bmRlZmluZWQgfHwgdmFsID09PSBudWxsIHx8ICh0aGlzLm51bWJlckZvcm1hdCAmJiAoaXNOYU4odmFsKSkpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnVuZGVmaW5lZFZhbHVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdGhpcy5fZm9ybWF0KHZhbCk7XHJcbiAgICB9O1xyXG4gICAgdGhpcy5nZXRGb3JtYXR0ZXIgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICBpZiAodGhpcy5zY2FsZSA9PSAnb3JkaW5hbCcgJiYgdGhpcy52YWx1ZUxhYmVscykge1xyXG4gICAgICAgICAgICB2YXIgc2NhbGUgPSBkMy5zY2FsZS5vcmRpbmFsKCkuZG9tYWluKHRoaXMuZG9tYWluKS5yYW5nZSh0aGlzLnZhbHVlTGFiZWxzKTtcclxuICAgICAgICAgICAgcmV0dXJuIHNjYWxlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy5udW1iZXJGb3JtYXQgJiYgdHlwZW9mIHRoaXMubnVtYmVyRm9ybWF0ID09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMubnVtYmVyRm9ybWF0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAobG9jYWxlUHJvdmlkZXIubG9jYWxlKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBsb2NhbGVQcm92aWRlci5sb2NhbGUubnVtYmVyRm9ybWF0KHRoaXMubnVtYmVyRm9ybWF0IHx8ICcuMDFmJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBkMy5mb3JtYXQodGhpcy5udW1iZXJGb3JtYXQgfHwgJy4wMWYnKTtcclxuICAgIH07XHJcbiAgICB0aGlzLmdldFJhbmdlRm9ybWF0dGVyID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgdmFyIGZtdCA9IHRoaXMuZm9ybWF0LmJpbmQodGhpcyk7XHJcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGxvd2VyLCB1cHBlciwgZXhjbHVkZUxvd2VyLCBleGNsdWRlVXBwZXIpIHtcclxuICAgICAgICAgICAgaWYgKGxvY2FsZVByb3ZpZGVyLmxvY2FsZSAmJiBsb2NhbGVQcm92aWRlci5sb2NhbGUucmFuZ2VMYWJlbCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGxvY2FsZVByb3ZpZGVyLmxvY2FsZS5yYW5nZUxhYmVsKGxvd2VyLCB1cHBlciwgZm10LCBleGNsdWRlTG93ZXIsIGV4Y2x1ZGVVcHBlcik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIGRlZmF1bHRSYW5nZUxhYmVsKGxvd2VyLCB1cHBlciwgZm10LCBleGNsdWRlTG93ZXIsIGV4Y2x1ZGVVcHBlcik7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5tZXRhID0gZnVuY3Rpb24obWV0YWRhdGEpe1xyXG4gICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhtZXRhZGF0YSk7XHJcbiAgICBmb3IgKHZhciBpPTA7IGk8a2V5cy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIHRoaXMubWV0YWRhdGFfc3BlY3MucHVzaChNZXRhRGF0YVNwZWMoa2V5c1tpXSwgbWV0YWRhdGFba2V5c1tpXV0pKTtcclxuICAgIH1cclxuICAgIHRoaXMubWV0YWRhdGFfc3BlY3Muc29ydChmdW5jdGlvbihhLGIpIHtcclxuICAgICAgICByZXR1cm4gYS5zcGVjaWZpY2l0eSgpLWIuc3BlY2lmaWNpdHkoKTtcclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLmdldE1ldGFkYXRhID0gZnVuY3Rpb24oa2V5KSB7XHJcbiAgICBpZiAoIXRoaXMubWV0YWRhdGEpIHtcclxuICAgICAgICB0aGlzLm1ldGFkYXRhID0ge307XHJcbiAgICB9XHJcbiAgICBpZiAoIXRoaXMubWV0YWRhdGFba2V5XSkge1xyXG4gICAgICAgIHZhciBmaWVsZHMgPSBtYXBtYXAuZXh0ZW5kKHt9LCB0aGlzLnNldHRpbmdzLmRlZmF1bHRNZXRhZGF0YSk7XHJcbiAgICAgICAgZm9yICh2YXIgaT0wOyBpPHRoaXMubWV0YWRhdGFfc3BlY3MubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMubWV0YWRhdGFfc3BlY3NbaV0ubWF0Y2goa2V5KSkge1xyXG4gICAgICAgICAgICAgICAgbWFwbWFwLmV4dGVuZChmaWVsZHMsIHRoaXMubWV0YWRhdGFfc3BlY3NbaV0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMubWV0YWRhdGFba2V5XSA9IE1ldGFEYXRhKGZpZWxkcywgdGhpcyk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcy5tZXRhZGF0YVtrZXldO1xyXG59O1xyXG5cclxuZnVuY3Rpb24gZ2V0U3RhdHMoZGF0YSwgdmFsdWVGdW5jKSB7XHJcbiAgICB2YXIgc3RhdHMgPSB7XHJcbiAgICAgICAgY291bnQ6IDAsXHJcbiAgICAgICAgY291bnROdW1iZXJzOiAwLFxyXG4gICAgICAgIGFueU5lZ2F0aXZlOiBmYWxzZSxcclxuICAgICAgICBhbnlQb3NpdGl2ZTogZmFsc2UsXHJcbiAgICAgICAgYW55U3RyaW5nczogZmFsc2UsXHJcbiAgICAgICAgbWluOiB1bmRlZmluZWQsXHJcbiAgICAgICAgbWF4OiB1bmRlZmluZWRcclxuICAgIH07XHJcbiAgICBmdW5jdGlvbiBkYXR1bUZ1bmMoZCkge1xyXG4gICAgICAgIHZhciB2YWwgPSB2YWx1ZUZ1bmMoZCk7XHJcbiAgICAgICAgaWYgKHZhbCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHN0YXRzLmNvdW50ICs9IDE7XHJcbiAgICAgICAgICAgIGlmIChkZC5pc051bWVyaWModmFsKSkge1xyXG4gICAgICAgICAgICAgICAgdmFsID0gK3ZhbDtcclxuICAgICAgICAgICAgICAgIHN0YXRzLmNvdW50TnVtYmVycyArPSAxO1xyXG4gICAgICAgICAgICAgICAgaWYgKHN0YXRzLm1pbiA9PT0gdW5kZWZpbmVkKSBzdGF0cy5taW4gPSB2YWw7XHJcbiAgICAgICAgICAgICAgICBpZiAoc3RhdHMubWF4ID09PSB1bmRlZmluZWQpIHN0YXRzLm1heCA9IHZhbDtcclxuICAgICAgICAgICAgICAgIGlmICh2YWwgPCBzdGF0cy5taW4pIHN0YXRzLm1pbiA9IHZhbDtcclxuICAgICAgICAgICAgICAgIGlmICh2YWwgPiBzdGF0cy5tYXgpIHN0YXRzLm1heCA9IHZhbDtcclxuICAgICAgICAgICAgICAgIGlmICh2YWwgPiAwKSBzdGF0cy5hbnlQb3NpdGl2ZSA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICBpZiAodmFsIDwgMCkgc3RhdHMuYW55TmVnYXRpdmUgPSB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKHZhbCkge1xyXG4gICAgICAgICAgICAgICAgc3RhdHMuYW55U3RyaW5nID0gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGlmIChkYXRhLmVhY2ggJiYgdHlwZW9mIGRhdGEuZWFjaCA9PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgZGF0YS5lYWNoKGRhdHVtRnVuYyk7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgICBmb3IgKHZhciBpPTA7IGk8ZGF0YS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBkYXR1bUZ1bmMoZGF0YVtpXSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHN0YXRzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBwcm9wZXJ0aWVzX2FjY2Vzc29yKGZ1bmMpIHtcclxuICAgIC8vIGNvbnZlcnRzIGEgZGF0YSBjYWxsYmFjayBmdW5jdGlvbiB0byBhY2Nlc3MgZGF0YSdzIC5wcm9wZXJ0aWVzIGVudHJ5XHJcbiAgICAvLyB1c2VmdWwgZm9yIHByb2Nlc3NpbmcgZ2VvanNvbiBvYmplY3RzXHJcbiAgICByZXR1cm4gZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgICAgIGlmIChkYXRhLnByb3BlcnRpZXMpIHJldHVybiBmdW5jKGRhdGEucHJvcGVydGllcyk7XHJcbiAgICB9O1xyXG59XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLmF1dG9Db2xvclNjYWxlID0gZnVuY3Rpb24odmFsdWUsIG1ldGFkYXRhLCBzZWxlY3Rpb24pIHtcclxuICAgIFxyXG4gICAgaWYgKCFtZXRhZGF0YSkge1xyXG4gICAgICAgIG1ldGFkYXRhID0gdGhpcy5nZXRNZXRhZGF0YSh2YWx1ZSk7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgICBtZXRhZGF0YSA9IGRkLm1lcmdlKHRoaXMuc2V0dGluZ3MuZGVmYXVsdE1ldGFkYXRhLCBtZXRhZGF0YSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghbWV0YWRhdGEuZG9tYWluKSB7XHJcbiAgICAgICAgdmFyIHN0YXRzID0gZ2V0U3RhdHModGhpcy5nZXRSZXByZXNlbnRhdGlvbnMoc2VsZWN0aW9uKSwgcHJvcGVydGllc19hY2Nlc3NvcihrZXlPckNhbGxiYWNrKHZhbHVlKSkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChzdGF0cy5hbnlOZWdhdGl2ZSAmJiBzdGF0cy5hbnlQb3NpdGl2ZSkge1xyXG4gICAgICAgICAgICAvLyBtYWtlIHN5bW1ldHJpY2FsXHJcbiAgICAgICAgICAgIG1ldGFkYXRhLmRvbWFpbiA9IFtNYXRoLm1pbihzdGF0cy5taW4sIC1zdGF0cy5tYXgpLCBNYXRoLm1heChzdGF0cy5tYXgsIC1zdGF0cy5taW4pXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIG1ldGFkYXRhLmRvbWFpbiA9IFtzdGF0cy5taW4sc3RhdHMubWF4XTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICAvLyBzdXBwb3J0IGQzIHNjYWxlcyBvdXQgb2YgdGhlIGJveFxyXG4gICAgdmFyIHNjYWxlID0gZDMuc2NhbGVbbWV0YWRhdGEuc2NhbGVdKCk7XHJcbiAgICBzY2FsZS5kb21haW4obWV0YWRhdGEuZG9tYWluKS5yYW5nZShtZXRhZGF0YS5jb2xvciB8fCBtZXRhZGF0YS5jb2xvcnMpXHJcbiAgICBcclxuICAgIGlmIChtZXRhZGF0YS5zY2FsZSA9PSAnb3JkaW5hbCcgJiYgIXNjYWxlLmludmVydCkge1xyXG4gICAgICAgIC8vIGQzIG9yZGluYWwgc2NhbGVzIGRvbid0IHByb3ZpZGUgaW52ZXJ0IG1ldGhvZCwgc28gcGF0Y2ggb25lIGhlcmVcclxuICAgICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vbWJvc3RvY2svZDMvcHVsbC81OThcclxuICAgICAgICBzY2FsZS5pbnZlcnQgPSBmdW5jdGlvbih4KSB7XHJcbiAgICAgICAgICAgIHZhciBpID0gc2NhbGUucmFuZ2UoKS5pbmRleE9mKHgpO1xyXG4gICAgICAgICAgICByZXR1cm4gKGkgPiAtMSkgPyBtZXRhZGF0YS5kb21haW5baV0gOiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIHNjYWxlOyAgICBcclxufTtcclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuYXV0b0xpbmVhclNjYWxlID0gZnVuY3Rpb24odmFsdWVGdW5jKSB7ICAgIFxyXG4gICAgdmFyIHN0YXRzID0gZ2V0U3RhdHModGhpcy5fZWxlbWVudHMuZ2VvbWV0cnkuc2VsZWN0QWxsKCdwYXRoJyksIHByb3BlcnRpZXNfYWNjZXNzb3IodmFsdWVGdW5jKSk7ICAgIFxyXG4gICAgcmV0dXJuIGQzLnNjYWxlLmxpbmVhcigpXHJcbiAgICAgICAgLmRvbWFpbihbMCxzdGF0cy5tYXhdKTsgICAgXHJcbn07XHJcbm1hcG1hcC5wcm90b3R5cGUuYXV0b1NxcnRTY2FsZSA9IGZ1bmN0aW9uKHZhbHVlRnVuYykgeyAgICBcclxuICAgIHZhciBzdGF0cyA9IGdldFN0YXRzKHRoaXMuX2VsZW1lbnRzLmdlb21ldHJ5LnNlbGVjdEFsbCgncGF0aCcpLCBwcm9wZXJ0aWVzX2FjY2Vzc29yKHZhbHVlRnVuYykpOyAgICBcclxuICAgIHJldHVybiBkMy5zY2FsZS5zcXJ0KClcclxuICAgICAgICAuZG9tYWluKFswLHN0YXRzLm1heF0pOyAgICBcclxufTtcclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuYXR0ciA9IGZ1bmN0aW9uKHNwZWMsIHNlbGVjdGlvbikge1xyXG4gICAgdGhpcy5zeW1ib2xpemUoZnVuY3Rpb24ocmVwcikge1xyXG4gICAgICAgIHJlcHIuYXR0cihzcGVjKTtcclxuICAgIH0sIHNlbGVjdGlvbik7XHJcbiAgICByZXR1cm4gdGhpcztcclxufVxyXG5cclxuLy8gVE9ETzogcmlnaHQgbm93LCBzeW1ib2xpemUgZG9lc24ndCBzZWVtIHRvIGJlIGFueSBkaWZmZXJlbnQgZnJvbSBhcHBseUJlaGF2aW9yIVxyXG4vLyBlaXRoZXIgdGhpcyBzaG91bGQgYmUgdW5pZmllZCwgb3IgdGhlIGRpc3RpbmN0aW9ucyBjbGVhcmx5IHdvcmtlZCBvdXRcclxubWFwbWFwLnByb3RvdHlwZS5zeW1ib2xpemUgPSBmdW5jdGlvbihjYWxsYmFjaywgc2VsZWN0aW9uLCBmaW5hbGl6ZSkge1xyXG5cclxuICAgIHZhciBtYXAgPSB0aGlzO1xyXG4gICAgXHJcbiAgICAvLyBzdG9yZSBpbiBjbG9zdXJlIGZvciBsYXRlciBhY2Nlc3NcclxuICAgIHNlbGVjdGlvbiA9IHNlbGVjdGlvbiB8fCB0aGlzLnNlbGVjdGVkO1xyXG4gICAgdGhpcy5wcm9taXNlX2RhdGEoKS50aGVuKGZ1bmN0aW9uKGRhdGEpIHsgICAgICBcclxuICAgICAgICBtYXAuZ2V0UmVwcmVzZW50YXRpb25zKHNlbGVjdGlvbilcclxuICAgICAgICAgICAgLmVhY2goZnVuY3Rpb24oZ2VvbSkge1xyXG4gICAgICAgICAgICAgICAgY2FsbGJhY2suY2FsbChtYXAsIGQzLnNlbGVjdCh0aGlzKSwgZ2VvbSwgZ2VvbS5wcm9wZXJ0aWVzKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgaWYgKGZpbmFsaXplKSBmaW5hbGl6ZS5jYWxsKG1hcCk7XHJcbiAgICB9KTtcclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5zeW1ib2xpemVBdHRyaWJ1dGUgPSBmdW5jdGlvbihhdHRyaWJ1dGUsIHJlcHJBdHRyaWJ1dGUsIG1ldGFBdHRyaWJ1dGUsIHNlbGVjdGlvbikge1xyXG5cclxuICAgIG1ldGFBdHRyaWJ1dGUgPSBtZXRhQXR0cmlidXRlIHx8IHJlcHJBdHRyaWJ1dGU7XHJcbiAgICBcclxuICAgIHNlbGVjdGlvbiA9IHNlbGVjdGlvbiB8fCB0aGlzLnNlbGVjdGVkO1xyXG4gICAgXHJcbiAgICB2YXIgbWFwID0gdGhpcztcclxuICAgIFxyXG4gICAgdGhpcy5wcm9taXNlX2RhdGEoKS50aGVuKGZ1bmN0aW9uKGRhdGEpIHsgICAgICBcclxuXHJcbiAgICAgICAgdmFyIG1ldGFkYXRhID0gbWFwLmdldE1ldGFkYXRhKGF0dHJpYnV0ZSk7XHJcblxyXG4gICAgICAgIHZhciBzY2FsZSA9IGQzLnNjYWxlW21ldGFkYXRhLnNjYWxlXSgpO1xyXG4gICAgICAgIHNjYWxlLmRvbWFpbihtZXRhZGF0YS5kb21haW4pLnJhbmdlKG1ldGFkYXRhW21ldGFBdHRyaWJ1dGVdKTtcclxuXHJcbiAgICAgICAgbWFwLnN5bWJvbGl6ZShmdW5jdGlvbihlbCwgZ2VvbSwgZGF0YSkge1xyXG4gICAgICAgICAgICBlbC5hdHRyKHJlcHJBdHRyaWJ1dGUsIHNjYWxlKGRhdGFbYXR0cmlidXRlXSkpO1xyXG4gICAgICAgIH0sIHNlbGVjdGlvbik7XHJcblxyXG4gICAgICAgIG1hcC51cGRhdGVMZWdlbmQoYXR0cmlidXRlLCByZXByQXR0cmlidXRlLCBtZXRhZGF0YSwgc2NhbGUsIHNlbGVjdGlvbik7XHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbiAgICBcclxufVxyXG5cclxuXHJcbi8vIFRPRE86IGltcHJvdmUgaGFuZGxpbmcgb2YgdXNpbmcgYSBmdW5jdGlvbiBoZXJlIHZzLiB1c2luZyBhIG5hbWVkIHByb3BlcnR5XHJcbi8vIHByb2JhYmx5IG5lZWRzIGEgdW5pZmllZCBtZWNoYW5pc20gdG8gZGVhbCB3aXRoIHByb3BlcnR5L2Z1bmMgdG8gYmUgdXNlZCBlbHNld2hlcmVcclxubWFwbWFwLnByb3RvdHlwZS5jaG9yb3BsZXRoID0gZnVuY3Rpb24oc3BlYywgbWV0YWRhdGEsIHNlbGVjdGlvbikgeyAgICBcclxuICAgIC8vIHdlIGhhdmUgdG8gcmVtZW1iZXIgdGhlIHNjYWxlIGZvciBsZWdlbmQoKVxyXG4gICAgdmFyIGNvbG9yU2NhbGUgPSBudWxsLFxyXG4gICAgICAgIHZhbHVlRnVuYyA9IGtleU9yQ2FsbGJhY2soc3BlYyksXHJcbiAgICAgICAgbWFwID0gdGhpcztcclxuICAgICAgICBcclxuICAgIGZ1bmN0aW9uIGNvbG9yKGVsLCBnZW9tLCBkYXRhKSB7XHJcbiAgICAgICAgaWYgKHNwZWMgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgLy8gY2xlYXJcclxuICAgICAgICAgICAgZWwuYXR0cignZmlsbCcsIHRoaXMuc2V0dGluZ3MucGF0aEF0dHJpYnV0ZXMuZmlsbCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gb24gZmlyc3QgY2FsbCwgc2V0IHVwIHNjYWxlICYgbGVnZW5kXHJcbiAgICAgICAgaWYgKCFjb2xvclNjYWxlKSB7XHJcbiAgICAgICAgICAgIC8vIFRPRE86IGltcHJvdmUgaGFuZGxpbmcgb2YgdGhpbmdzIHRoYXQgbmVlZCB0aGUgZGF0YSwgYnV0IHNob3VsZCBiZSBwZXJmb3JtZWRcclxuICAgICAgICAgICAgLy8gb25seSBvbmNlLiBTaG91bGQgd2UgcHJvdmlkZSBhIHNlcGFyYXRlIGNhbGxiYWNrIGZvciB0aGlzLCBvciB1c2UgdGhlIFxyXG4gICAgICAgICAgICAvLyBwcm9taXNlX2RhdGEoKS50aGVuKCkgZm9yIHNldHVwPyBBcyB0aGlzIGNvdWxkIGJlIGNvbnNpZGVyZWQgYSBwdWJsaWMgQVBJIHVzZWNhc2UsXHJcbiAgICAgICAgICAgIC8vIG1heWJlIHVzaW5nIHByb21pc2VzIGlzIGEgYml0IHN0ZWVwIGZvciBvdXRzaWRlIHVzZXJzP1xyXG4gICAgICAgICAgICBpZiAodHlwZW9mIG1ldGFkYXRhID09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgICAgICAgICBtZXRhZGF0YSA9IHRoaXMuZ2V0TWV0YWRhdGEobWV0YWRhdGEpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmICghbWV0YWRhdGEpIHtcclxuICAgICAgICAgICAgICAgIG1ldGFkYXRhID0gdGhpcy5nZXRNZXRhZGF0YShzcGVjKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjb2xvclNjYWxlID0gdGhpcy5hdXRvQ29sb3JTY2FsZShzcGVjLCBtZXRhZGF0YSwgc2VsZWN0aW9uKTtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVMZWdlbmQoc3BlYywgJ2ZpbGwnLCBtZXRhZGF0YSwgY29sb3JTY2FsZSwgc2VsZWN0aW9uKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGVsLmF0dHIoJ2ZpbGwnKSAhPSAnbm9uZScpIHtcclxuICAgICAgICAgICAgLy8gdHJhbnNpdGlvbiBpZiBjb2xvciBhbHJlYWR5IHNldFxyXG4gICAgICAgICAgICBlbCA9IGVsLnRyYW5zaXRpb24oKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWwuYXR0cignZmlsbCcsIGZ1bmN0aW9uKGdlb20pIHsgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgdmFsID0gdmFsdWVGdW5jKGdlb20ucHJvcGVydGllcyk7XHJcbiAgICAgICAgICAgIC8vIGNoZWNrIGlmIHZhbHVlIGlzIHVuZGVmaW5lZCBvciBudWxsXHJcbiAgICAgICAgICAgIGlmICh2YWwgPT0gbnVsbCB8fCAobWV0YWRhdGEuc2NhbGUgIT0gJ29yZGluYWwnICYmIGlzTmFOKHZhbCkpKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbWV0YWRhdGEudW5kZWZpbmVkQ29sb3IgfHwgbWFwLnNldHRpbmdzLnBhdGhBdHRyaWJ1dGVzLmZpbGw7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIGNvbG9yU2NhbGUodmFsKSB8fCBtYXAuc2V0dGluZ3MucGF0aEF0dHJpYnV0ZXMuZmlsbDtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhpcy5zeW1ib2xpemUoY29sb3IsIHNlbGVjdGlvbiwgZnVuY3Rpb24oKXtcclxuICAgICAgICB0aGlzLmRpc3BhdGNoZXIuY2hvcm9wbGV0aC5jYWxsKHRoaXMsIHNwZWMpO1xyXG4gICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbi8vIFRPRE86IHRoaXMgaHNvdWxkIGJlIGVhc2lseSBpbXBsZW1lbnRlZCB1c2luZyBzeW1ib2xpemVBdHRyaWJ1dGUgYW5kIHJlbW92ZWRcclxubWFwbWFwLnByb3RvdHlwZS5zdHJva2VDb2xvciA9IGZ1bmN0aW9uKHNwZWMsIG1ldGFkYXRhLCBzZWxlY3Rpb24pIHsgICAgXHJcbiAgICAvLyB3ZSBoYXZlIHRvIHJlbWVtYmVyIHRoZSBzY2FsZSBmb3IgbGVnZW5kKClcclxuICAgIHZhciBjb2xvclNjYWxlID0gbnVsbCxcclxuICAgICAgICB2YWx1ZUZ1bmMgPSBrZXlPckNhbGxiYWNrKHNwZWMpLFxyXG4gICAgICAgIG1hcCA9IHRoaXM7XHJcbiAgICAgICAgXHJcbiAgICBmdW5jdGlvbiBjb2xvcihlbCwgZ2VvbSwgZGF0YSkge1xyXG4gICAgICAgIGlmIChzcGVjID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIC8vIGNsZWFyXHJcbiAgICAgICAgICAgIGVsLmF0dHIoJ3N0cm9rZScsIHRoaXMuc2V0dGluZ3MucGF0aEF0dHJpYnV0ZXMuc3Ryb2tlKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBvbiBmaXJzdCBjYWxsLCBzZXQgdXAgc2NhbGUgJiBsZWdlbmRcclxuICAgICAgICBpZiAoIWNvbG9yU2NhbGUpIHtcclxuICAgICAgICAgICAgLy8gVE9ETzogaW1wcm92ZSBoYW5kbGluZyBvZiB0aGluZ3MgdGhhdCBuZWVkIHRoZSBkYXRhLCBidXQgc2hvdWxkIGJlIHBlcmZvcm1lZFxyXG4gICAgICAgICAgICAvLyBvbmx5IG9uY2UuIFNob3VsZCB3ZSBwcm92aWRlIGEgc2VwYXJhdGUgY2FsbGJhY2sgZm9yIHRoaXMsIG9yIHVzZSB0aGUgXHJcbiAgICAgICAgICAgIC8vIHByb21pc2VfZGF0YSgpLnRoZW4oKSBmb3Igc2V0dXA/IEFzIHRoaXMgY291bGQgYmUgY29uc2lkZXJlZCBhIHB1YmxpYyBBUEkgdXNlY2FzZSxcclxuICAgICAgICAgICAgLy8gbWF5YmUgdXNpbmcgcHJvbWlzZXMgaXMgYSBiaXQgc3RlZXAgZm9yIG91dHNpZGUgdXNlcnM/XHJcbiAgICAgICAgICAgIGlmICh0eXBlb2YgbWV0YWRhdGEgPT0gJ3N0cmluZycpIHtcclxuICAgICAgICAgICAgICAgIG1ldGFkYXRhID0gdGhpcy5nZXRNZXRhZGF0YShtZXRhZGF0YSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKCFtZXRhZGF0YSkge1xyXG4gICAgICAgICAgICAgICAgbWV0YWRhdGEgPSB0aGlzLmdldE1ldGFkYXRhKHNwZWMpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbG9yU2NhbGUgPSB0aGlzLmF1dG9Db2xvclNjYWxlKHNwZWMsIG1ldGFkYXRhLCBzZWxlY3Rpb24pO1xyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUxlZ2VuZChzcGVjLCAnc3Ryb2tlQ29sb3InLCBtZXRhZGF0YSwgY29sb3JTY2FsZSwgc2VsZWN0aW9uKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGVsLmF0dHIoJ3N0cm9rZScpICE9ICdub25lJykge1xyXG4gICAgICAgICAgICAvLyB0cmFuc2l0aW9uIGlmIGNvbG9yIGFscmVhZHkgc2V0XHJcbiAgICAgICAgICAgIGVsID0gZWwudHJhbnNpdGlvbigpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbC5hdHRyKCdzdHJva2UnLCBmdW5jdGlvbihnZW9tKSB7ICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIHZhbCA9IHZhbHVlRnVuYyhnZW9tLnByb3BlcnRpZXMpO1xyXG4gICAgICAgICAgICAvLyBjaGVjayBpZiB2YWx1ZSBpcyB1bmRlZmluZWQgb3IgbnVsbFxyXG4gICAgICAgICAgICBpZiAodmFsID09IG51bGwgfHwgKG1ldGFkYXRhLnNjYWxlICE9ICdvcmRpbmFsJyAmJiBpc05hTih2YWwpKSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG1ldGFkYXRhLnVuZGVmaW5lZENvbG9yIHx8IG1hcC5zZXR0aW5ncy5wYXRoQXR0cmlidXRlcy5zdHJva2U7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIGNvbG9yU2NhbGUodmFsKSB8fCBtYXAuc2V0dGluZ3MucGF0aEF0dHJpYnV0ZXMuc3Ryb2tlO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB0aGlzLnN5bWJvbGl6ZShjb2xvciwgc2VsZWN0aW9uKTtcclxuICAgICAgICBcclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxuLy8gVE9ETzogc2hvdWxkIHdlIGV2ZW4gaGF2ZSB0aGlzLCBvciBwdXQgdml6LiB0ZWNobmlxdWVzIGluIGEgc2VwYXJhdGUgcHJvamVjdC9uYW1lc3BhY2U/XHJcbm1hcG1hcC5wcm90b3R5cGUucHJvcG9ydGlvbmFsX2NpcmNsZXMgPSBmdW5jdGlvbih2YWx1ZSwgc2NhbGUpIHtcclxuICAgIFxyXG4gICAgdmFyIHZhbHVlRnVuYyA9IGtleU9yQ2FsbGJhY2sodmFsdWUpO1xyXG5cclxuICAgIHZhciBwYXRoR2VuZXJhdG9yID0gZDMuZ2VvLnBhdGgoKS5wcm9qZWN0aW9uKHRoaXMuX3Byb2plY3Rpb24pOyAgICBcclxuICAgIFxyXG4gICAgc2NhbGUgPSBzY2FsZSB8fCAyMDtcclxuICAgIFxyXG4gICAgdGhpcy5zeW1ib2xpemUoZnVuY3Rpb24oZWwsIGdlb20sIGRhdGEpIHtcclxuICAgICAgICBpZiAodmFsdWUgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgdGhpcy5fZWxlbWVudHMub3ZlcmxheS5zZWxlY3QoJ2NpcmNsZScpLnJlbW92ZSgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIGlmIChnZW9tLnByb3BlcnRpZXMgJiYgdHlwZW9mIHZhbHVlRnVuYyhnZW9tLnByb3BlcnRpZXMpICE9ICd1bmRlZmluZWQnKSB7XHJcbiAgICAgICAgICAgIC8vIGlmIHNjYWxlIGlzIG5vdCBzZXQsIGNhbGN1bGF0ZSBzY2FsZSBvbiBmaXJzdCBjYWxsXHJcbiAgICAgICAgICAgIGlmICh0eXBlb2Ygc2NhbGUgIT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICAgICAgc2NhbGUgPSB0aGlzLmF1dG9TcXJ0U2NhbGUodmFsdWVGdW5jKS5yYW5nZShbMCxzY2FsZV0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHZhciBjZW50cm9pZCA9IHBhdGhHZW5lcmF0b3IuY2VudHJvaWQoZ2VvbSk7XHJcbiAgICAgICAgICAgIHRoaXMuX2VsZW1lbnRzLm92ZXJsYXkuYXBwZW5kKCdjaXJjbGUnKVxyXG4gICAgICAgICAgICAgICAgLmF0dHIodGhpcy5zZXR0aW5ncy5vdmVybGF5QXR0cmlidXRlcylcclxuICAgICAgICAgICAgICAgIC5hdHRyKHtcclxuICAgICAgICAgICAgICAgICAgICByOiBzY2FsZSh2YWx1ZUZ1bmMoZ2VvbS5wcm9wZXJ0aWVzKSksXHJcbiAgICAgICAgICAgICAgICAgICAgY3g6IGNlbnRyb2lkWzBdLFxyXG4gICAgICAgICAgICAgICAgICAgIGN5OiBjZW50cm9pZFsxXVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbm1hcG1hcC5zeW1ib2xpemUgPSB7fTtcclxuXHJcbm1hcG1hcC5zeW1ib2xpemUuYWRkTGFiZWwgPSBmdW5jdGlvbihzcGVjKSB7XHJcblxyXG4gICAgdmFyIHZhbHVlRnVuYyA9IGtleU9yQ2FsbGJhY2soc3BlYyk7XHJcbiAgICAgICAgXHJcbiAgICB2YXIgcGF0aEdlbmVyYXRvciA9IGQzLmdlby5wYXRoKCk7ICAgIFxyXG5cclxuICAgIHJldHVybiBmdW5jdGlvbihlbCwgZ2VvbSwgZGF0YSkge1xyXG4gICAgICAgIC8vIGxhenkgaW5pdGlhbGl6YXRpb24gb2YgcHJvamVjdGlvblxyXG4gICAgICAgIC8vIHdlIGRvbnQndCBoYXZlIGFjY2VzcyB0byB0aGUgbWFwIGFib3ZlLCBhbmQgYWxzbyBwcm9qZWN0aW9uXHJcbiAgICAgICAgLy8gbWF5IG5vdCBoYXZlIGJlZW4gaW5pdGlhbGl6ZWQgY29ycmVjdGx5XHJcbiAgICAgICAgaWYgKHBhdGhHZW5lcmF0b3IucHJvamVjdGlvbigpICE9PSB0aGlzLl9wcm9qZWN0aW9uKSB7XHJcbiAgICAgICAgICAgIHBhdGhHZW5lcmF0b3IucHJvamVjdGlvbih0aGlzLl9wcm9qZWN0aW9uKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFRPRE86IGhvdyB0byBwcm9wZXJseSByZW1vdmUgc3ltYm9saXphdGlvbnM/XHJcbiAgICAgICAgaWYgKHNwZWMgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgdGhpcy5fZWxlbWVudHMub3ZlcmxheS5zZWxlY3QoJ2NpcmNsZScpLnJlbW92ZSgpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChnZW9tLnByb3BlcnRpZXMgJiYgdHlwZW9mIHZhbHVlRnVuYyhnZW9tLnByb3BlcnRpZXMpICE9ICd1bmRlZmluZWQnKSB7XHJcbiAgICAgICAgICAgIHZhciBjZW50cm9pZCA9IHBhdGhHZW5lcmF0b3IuY2VudHJvaWQoZ2VvbSk7XHJcbiAgICAgICAgICAgIHRoaXMuX2VsZW1lbnRzLm92ZXJsYXkuYXBwZW5kKCd0ZXh0JylcclxuICAgICAgICAgICAgICAgIC50ZXh0KHZhbHVlRnVuYyhnZW9tLnByb3BlcnRpZXMpKVxyXG4gICAgICAgICAgICAgICAgLmF0dHIoe1xyXG4gICAgICAgICAgICAgICAgICAgIHN0cm9rZTogJyNmZmZmZmYnLFxyXG4gICAgICAgICAgICAgICAgICAgIGZpbGw6ICcjMDAwMDAwJyxcclxuICAgICAgICAgICAgICAgICAgICAnZm9udC1zaXplJzogOSxcclxuICAgICAgICAgICAgICAgICAgICAncGFpbnQtb3JkZXInOiAnc3Ryb2tlIGZpbGwnLFxyXG4gICAgICAgICAgICAgICAgICAgICdhbGlnbm1lbnQtYmFzZWxpbmUnOiAnbWlkZGxlJyxcclxuICAgICAgICAgICAgICAgICAgICBkeDogNyxcclxuICAgICAgICAgICAgICAgICAgICBkeTogMVxyXG4gICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgICAgIC5hdHRyKHsgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIHg6IGNlbnRyb2lkWzBdLFxyXG4gICAgICAgICAgICAgICAgICAgIHk6IGNlbnRyb2lkWzFdXHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICA7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBhZGRPcHRpb25hbEVsZW1lbnQoZWxlbWVudE5hbWUpIHtcclxuICAgIHJldHVybiBmdW5jdGlvbih2YWx1ZSkge1xyXG4gICAgICAgIHZhciB2YWx1ZUZ1bmMgPSBrZXlPckNhbGxiYWNrKHZhbHVlKTtcclxuICAgICAgICB0aGlzLnN5bWJvbGl6ZShmdW5jdGlvbihlbCwgZCkgeyAgXHJcbiAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgZWwuc2VsZWN0KGVsZW1lbnROYW1lKS5yZW1vdmUoKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbC5hcHBlbmQoZWxlbWVudE5hbWUpXHJcbiAgICAgICAgICAgICAgICAudGV4dCh2YWx1ZUZ1bmMoZC5wcm9wZXJ0aWVzKSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9O1xyXG59XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLnRpdGxlID0gYWRkT3B0aW9uYWxFbGVtZW50KCd0aXRsZScpO1xyXG5tYXBtYXAucHJvdG90eXBlLmRlc2MgPSBhZGRPcHRpb25hbEVsZW1lbnQoJ2Rlc2MnKTtcclxuXHJcbnZhciBjZW50ZXIgPSB7XHJcbiAgICB4OiAwLjUsXHJcbiAgICB5OiAwLjVcclxufTtcclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuY2VudGVyID0gZnVuY3Rpb24oY2VudGVyX3gsIGNlbnRlcl95KSB7XHJcbiAgICBjZW50ZXIueCA9IGNlbnRlcl94O1xyXG4gICAgaWYgKHR5cGVvZiBjZW50ZXJfeSAhPSAndW5kZWZpbmVkJykge1xyXG4gICAgICAgIGNlbnRlci55ID0gY2VudGVyX3k7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuLy8gc3RvcmUgYWxsIGhvdmVyIG91dCBjYWxsYmFja3MgaGVyZSwgdGhpcyB3aWxsIGJlIGNhbGxlZCBvbiB6b29tXHJcbnZhciBob3Zlck91dENhbGxiYWNrcyA9IFtdO1xyXG5cclxuZnVuY3Rpb24gY2FsbEhvdmVyT3V0KCkge1xyXG4gICAgZm9yICh2YXIgaT0wOyBpPGhvdmVyT3V0Q2FsbGJhY2tzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgaG92ZXJPdXRDYWxsYmFja3NbaV0oKTtcclxuICAgIH1cclxufVxyXG5cclxudmFyIG1vdXNlb3ZlciA9IG51bGw7XHJcblxyXG5tYXBtYXAuc2hvd0hvdmVyID0gZnVuY3Rpb24oZWwpIHtcclxuICAgIGlmIChtb3VzZW92ZXIpIHtcclxuICAgICAgICBtb3VzZW92ZXIuY2FsbChlbCwgZWwuX19kYXRhX18pO1xyXG4gICAgfVxyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5nZXRBbmNob3JGb3JSZXByID0gZnVuY3Rpb24oZXZlbnQsIHJlcHIsIG9wdGlvbnMpIHtcclxuXHJcbiAgICBvcHRpb25zID0gZGQubWVyZ2Uoe1xyXG4gICAgICAgIGNsaXBUb1ZpZXdwb3J0OiB0cnVlLFxyXG4gICAgICAgIGNsaXBNYXJnaW5zOiB7dG9wOiA0MCwgbGVmdDogNDAsIGJvdHRvbTogMCwgcmlnaHQ6IDQwfVxyXG4gICAgfSwgb3B0aW9ucyk7XHJcbiAgICBcclxuICAgIHZhciBib3VuZHMgPSByZXByLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgdmFyIHB0ID0gdGhpcy5fZWxlbWVudHMubWFpbi5ub2RlKCkuY3JlYXRlU1ZHUG9pbnQoKTtcclxuICAgIFxyXG4gICAgcHQueCA9IChib3VuZHMubGVmdCArIGJvdW5kcy5yaWdodCkgLyAyO1xyXG4gICAgcHQueSA9IGJvdW5kcy50b3A7XHJcbiAgICBcclxuICAgIHZhciBtYXBCb3VuZHMgPSB0aGlzLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgXHJcbiAgICBpZiAob3B0aW9ucy5jbGlwVG9WaWV3cG9ydCkgeyAgXHJcbiAgICAgICAgaWYgKHB0LnggPCBtYXBCb3VuZHMubGVmdCArIG9wdGlvbnMuY2xpcE1hcmdpbnMubGVmdCkgcHQueCA9IG1hcEJvdW5kcy5sZWZ0ICsgb3B0aW9ucy5jbGlwTWFyZ2lucy5sZWZ0O1xyXG4gICAgICAgIGlmIChwdC54ID4gbWFwQm91bmRzLnJpZ2h0IC0gb3B0aW9ucy5jbGlwTWFyZ2lucy5yaWdodCkgcHQueCA9IG1hcEJvdW5kcy5yaWdodCAtIG9wdGlvbnMuY2xpcE1hcmdpbnMucmlnaHQ7XHJcbiAgICAgICAgaWYgKHB0LnkgPCBtYXBCb3VuZHMudG9wICsgb3B0aW9ucy5jbGlwTWFyZ2lucy50b3ApIHB0LnkgPSBtYXBCb3VuZHMudG9wICsgb3B0aW9ucy5jbGlwTWFyZ2lucy50b3A7XHJcbiAgICAgICAgaWYgKHB0LnkgPiBtYXBCb3VuZHMuYm90dG9tIC0gb3B0aW9ucy5jbGlwTWFyZ2lucy5ib3R0b20pIHB0LnkgPSBtYXBCb3VuZHMuYm90dG9tIC0gb3B0aW9ucy5jbGlwTWFyZ2lucy5ib3R0b207XHJcbiAgICB9XHJcbiAgICBwdC54IC09IG1hcEJvdW5kcy5sZWZ0O1xyXG4gICAgcHQueSAtPSBtYXBCb3VuZHMudG9wO1xyXG5cclxuICAgIHJldHVybiBwdDtcclxufVxyXG5cclxubWFwbWFwLnByb3RvdHlwZS5nZXRBbmNob3JGb3JNb3VzZVBvc2l0aW9uID0gZnVuY3Rpb24oZXZlbnQsIHJlcHIsIG9wdGlvbnMpIHtcclxuICAgICBcclxuICAgIG9wdGlvbnMgPSBkZC5tZXJnZSh7XHJcbiAgICAgICAgYW5jaG9yT2Zmc2V0OiBbMCwtMjBdXHJcbiAgICAgfSwgb3B0aW9ucyk7XHJcblxyXG4gICAgIC8vIGh0dHA6Ly93d3cuamFja2xtb29yZS5jb20vbm90ZXMvbW91c2UtcG9zaXRpb24vXHJcbiAgICAgdmFyIG9mZnNldFggPSBldmVudC5sYXllclggfHwgZXZlbnQub2Zmc2V0WCxcclxuICAgICAgICAgb2Zmc2V0WSA9IGV2ZW50LmxheWVyWSB8fCBldmVudC5vZmZzZXRZO1xyXG4gICAgXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHg6IG9mZnNldFggKyBvcHRpb25zLmFuY2hvck9mZnNldFswXSxcclxuICAgICAgICB5OiBvZmZzZXRZICsgb3B0aW9ucy5hbmNob3JPZmZzZXRbMV1cclxuICAgIH1cclxufVxyXG5cclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuaG92ZXIgPSBmdW5jdGlvbihvdmVyQ0IsIG91dENCLCBvcHRpb25zKSB7XHJcblxyXG4gICAgb3B0aW9ucyA9IGRkLm1lcmdlKHtcclxuICAgICAgICBtb3ZlVG9Gcm9udDogdHJ1ZSxcclxuICAgICAgICBjbGlwVG9WaWV3cG9ydDogdHJ1ZSxcclxuICAgICAgICBjbGlwTWFyZ2luczoge3RvcDogNDAsIGxlZnQ6IDQwLCBib3R0b206IDAsIHJpZ2h0OiA0MH0sXHJcbiAgICAgICAgc2VsZWN0aW9uOiBudWxsLFxyXG4gICAgICAgIGFuY2hvclBvc2l0aW9uOiB0aGlzLmdldEFuY2hvckZvclJlcHJcclxuICAgICB9LCBvcHRpb25zKTtcclxuICAgIFxyXG4gICAgdmFyIG1hcCA9IHRoaXM7XHJcbiAgICBcclxuICAgIGlmICghdGhpcy5fb2xkUG9pbnRlckV2ZW50cykge1xyXG4gICAgICAgIHRoaXMuX29sZFBvaW50ZXJFdmVudHMgPSBbXTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhpcy5wcm9taXNlX2RhdGEoKS50aGVuKGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHZhciBvYmogPSBtYXAuZ2V0UmVwcmVzZW50YXRpb25zKG9wdGlvbnMuc2VsZWN0aW9uKTtcclxuICAgICAgICBtb3VzZW92ZXIgPSBmdW5jdGlvbihkKSB7XHJcbiAgICAgICAgICAgIC8vIFwidGhpc1wiIGlzIHRoZSBlbGVtZW50LCBub3QgdGhlIG1hcCFcclxuICAgICAgICAgICAgLy8gbW92ZSB0byB0b3AgPSBlbmQgb2YgcGFyZW50IG5vZGVcclxuICAgICAgICAgICAgLy8gdGhpcyBzY3Jld3MgdXAgSUUgZXZlbnQgaGFuZGxpbmchXHJcbiAgICAgICAgICAgIGlmIChvcHRpb25zLm1vdmVUb0Zyb250ICYmIG1hcC5zdXBwb3J0cy5ob3ZlckRvbU1vZGlmaWNhdGlvbikge1xyXG4gICAgICAgICAgICAgICAgLy8gVE9ETzogdGhpcyBzaG91bGQgYmUgc29sdmVkIHZpYSBhIHNlY29uZCBlbGVtZW50IHRvIGJlIHBsYWNlZCBpbiBmcm9udCFcclxuICAgICAgICAgICAgICAgIHRoaXMuX19ob3Zlcmluc2VydHBvc2l0aW9uX18gPSB0aGlzLm5leHRTaWJsaW5nO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wYXJlbnROb2RlLmFwcGVuZENoaWxkKHRoaXMpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgZWwgPSB0aGlzLFxyXG4gICAgICAgICAgICAgICAgZXZlbnQgPSBkMy5ldmVudDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIEluIEZpcmVmb3ggdGhlIGV2ZW50IHBvc2l0aW9ucyBhcmUgbm90IHBvcHVsYXRlZCBwcm9wZXJseSBpbiBzb21lIGNhc2VzXHJcbiAgICAgICAgICAgIC8vIERlZmVyIGNhbGwgdG8gYWxsb3cgYnJvd3NlciB0byBwb3B1bGF0ZSB0aGUgZXZlbnRcclxuICAgICAgICAgICAgd2luZG93LnNldFRpbWVvdXQoZnVuY3Rpb24oKXtcclxuICAgICAgICAgICAgICAgIHZhciBhbmNob3IgPSBvcHRpb25zLmFuY2hvclBvc2l0aW9uLmNhbGwobWFwLCBldmVudCwgZWwsIG9wdGlvbnMpOyAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBvdmVyQ0IuY2FsbChtYXAsIGQucHJvcGVydGllcywgYW5jaG9yLCBlbCk7ICAgXHJcbiAgICAgICAgICAgIH0sIDEwKTtcclxuICAgICAgICB9O1xyXG4gICAgICAgIC8vIHJlc2V0IHByZXZpb3VzbHkgb3ZlcnJpZGRlbiBwb2ludGVyIGV2ZW50c1xyXG4gICAgICAgIGZvciAodmFyIGk9MDsgaTxtYXAuX29sZFBvaW50ZXJFdmVudHMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgdmFyIHBhaXIgPSBtYXAuX29sZFBvaW50ZXJFdmVudHNbaV07XHJcbiAgICAgICAgICAgIHBhaXJbMF0uc3R5bGUoJ3BvaW50ZXItZXZlbnRzJywgcGFpclsxXSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIG1hcC5fb2xkUG9pbnRlckV2ZW50cyA9IFtdO1xyXG4gICAgICAgIGlmIChvdmVyQ0IpIHtcclxuICAgICAgICAgICAgb2JqXHJcbiAgICAgICAgICAgICAgICAub24oJ21vdXNlb3ZlcicsIG1vdXNlb3ZlcilcclxuICAgICAgICAgICAgICAgIC5lYWNoKGZ1bmN0aW9uKCl7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gVE9ETzogbm90IHN1cmUgaWYgdGhpcyBpcyB0aGUgYmVzdCBpZGVhLCBidXQgd2UgbmVlZCB0byBtYWtlIHN1cmVcclxuICAgICAgICAgICAgICAgICAgICAvLyB0byByZWNlaXZlIHBvaW50ZXIgZXZlbnRzIGV2ZW4gaWYgY3NzIGRpc2FibGVzIHRoZW0uIFRoaXMgaGFzIHRvIHdvcmtcclxuICAgICAgICAgICAgICAgICAgICAvLyBldmVuIGZvciBjb21wbGV4IChmdW5jdGlvbi1iYXNlZCkgc2VsZWN0aW9ucywgc28gd2UgY2Fubm90IHVzZSBjb250YWlubWVudFxyXG4gICAgICAgICAgICAgICAgICAgIC8vIHNlbGVjdG9ycyAoZS5nLiAuc2VsZWN0ZWQtZm9vIC5mb28pIGZvciB0aGlzLi4uXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvU1ZHL0F0dHJpYnV0ZS9wb2ludGVyLWV2ZW50c1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBzZWwgPSBkMy5zZWxlY3QodGhpcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgbWFwLl9vbGRQb2ludGVyRXZlbnRzLnB1c2goW3NlbCwgc2VsLnN0eWxlKCdwb2ludGVyLWV2ZW50cycpXSk7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gVE9ETzogdGhpcyBzaG91bGQgYmUgY29uZmlndXJhYmxlIHZpYSBvcHRpb25zXHJcbiAgICAgICAgICAgICAgICAgICAgLy9zZWwuc3R5bGUoJ3BvaW50ZXItZXZlbnRzJywnYWxsJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgc2VsLnN0eWxlKCdwb2ludGVyLWV2ZW50cycsJ3Zpc2libGVQYWludGVkJyk7XHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICBvYmoub24oJ21vdXNlb3ZlcicsIG51bGwpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAob3V0Q0IpIHtcclxuICAgICAgICAgICAgb2JqLm9uKCdtb3VzZW91dCcsIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX19ob3Zlcmluc2VydHBvc2l0aW9uX18pIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKHRoaXMsIHRoaXMuX19ob3Zlcmluc2VydHBvc2l0aW9uX18pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgaWYgKG91dENCKSBvdXRDQigpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgaG92ZXJPdXRDYWxsYmFja3MucHVzaChvdXRDQik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICBvYmoub24oJ21vdXNlb3V0JywgbnVsbCk7XHJcbiAgICAgICAgfSAgICAgICAgICBcclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLmZvcm1hdFZhbHVlID0gZnVuY3Rpb24oZCwgYXR0cikge1xyXG4gICAgdmFyIG1ldGEgPSB0aGlzLmdldE1ldGFkYXRhKGF0dHIpLFxyXG4gICAgICAgIHZhbCA9IG1ldGEuZm9ybWF0KGRbYXR0cl0pO1xyXG4gICAgaWYgKHZhbCA9PSAnTmFOJykgdmFsID0gZFthdHRyXTtcclxuICAgIHJldHVybiB2YWw7XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLmJ1aWxkSFRNTEZ1bmMgPSBmdW5jdGlvbihzcGVjKSB7XHJcbiAgICAvLyBmdW5jdGlvbiBjYXNlXHJcbiAgICBpZiAodHlwZW9mIHNwZWMgPT0gJ2Z1bmN0aW9uJykgcmV0dXJuIHNwZWM7XHJcbiAgICAvLyBzdHJpbmcgY2FzZVxyXG4gICAgaWYgKHNwZWMuc3Vic3RyKSBzcGVjID0gW3NwZWNdO1xyXG4gICAgXHJcbiAgICB2YXIgbWFwID0gdGhpcztcclxuICAgIFxyXG4gICAgdmFyIGZ1bmMgPSBmdW5jdGlvbihkKSB7XHJcbiAgICAgICAgdmFyIGh0bWwgPSBcIlwiLFxyXG4gICAgICAgICAgICBwcmUsIHBvc3Q7XHJcbiAgICAgICAgZm9yICh2YXIgaT0wOyBpPHNwZWMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgdmFyIHBhcnQgPSBzcGVjW2ldO1xyXG4gICAgICAgICAgICBpZiAocGFydCkge1xyXG4gICAgICAgICAgICAgICAgcHJlID0gKGk9PTApID8gJzxiPicgOiAnJztcclxuICAgICAgICAgICAgICAgIHBvc3QgPSAoaT09MCkgPyAnPC9iPjxicj4nIDogJzxicj4nO1xyXG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBwYXJ0ID09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgc3RyID0gcGFydC5jYWxsKG1hcCwgZCk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0cikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBodG1sICs9IHByZSArIHN0ciArIHBvc3Q7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgdmFyIG1ldGEgPSBtYXAuZ2V0TWV0YWRhdGEocGFydCk7XHJcbiAgICAgICAgICAgICAgICB2YXIgcHJlZml4ID0gbWV0YS5ob3ZlckxhYmVsIHx8IG1ldGEudmFsdWVMYWJlbCB8fCBtZXRhLmxhYmVsIHx8ICcnO1xyXG4gICAgICAgICAgICAgICAgaWYgKHByZWZpeCkgcHJlZml4ICs9IFwiOiBcIjtcclxuICAgICAgICAgICAgICAgIHZhciB2YWwgPSBtZXRhLmZvcm1hdChkW3BhcnRdKTtcclxuICAgICAgICAgICAgICAgIGlmICh2YWwgPT0gJ05hTicpIHZhbCA9IGRbcGFydF07XHJcbiAgICAgICAgICAgICAgICAvLyBUT0RPOiBtYWtlIG9wdGlvbiBcImlnbm9yZVVuZGVmaW5lZFwiIGV0Yy5cclxuICAgICAgICAgICAgICAgIGlmICh2YWwgIT09IHVuZGVmaW5lZCAmJiB2YWwgIT09IG1ldGEudW5kZWZpbmVkVmFsdWUpIHtcclxuICAgICAgICAgICAgICAgICAgICBodG1sICs9IHByZSArIHByZWZpeCArIHZhbCArICggbWV0YS52YWx1ZVVuaXQgPyAnICcgKyBtZXRhLnZhbHVlVW5pdCA6ICcnKSArIHBvc3Q7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChtZXRhLnVuZGVmaW5lZExhYmVsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaHRtbCArPSBwcmUgKyBwcmVmaXggKyBtZXRhLnVuZGVmaW5lZExhYmVsICsgcG9zdDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gaHRtbDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHJldHVybiBmdW5jO1xyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5ob3ZlckluZm8gPSBmdW5jdGlvbihzcGVjLCBvcHRpb25zKSB7XHJcblxyXG4gICAgb3B0aW9ucyA9IGRkLm1lcmdlKHtcclxuICAgICAgICBzZWxlY3Rpb246IG51bGwsXHJcbiAgICAgICAgaG92ZXJDbGFzc05hbWU6ICdob3ZlckluZm8nLFxyXG4gICAgICAgIGhvdmVyU3R5bGU6IHtcclxuICAgICAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsXHJcbiAgICAgICAgICAgIHBhZGRpbmc6ICcwLjVlbSAwLjdlbScsXHJcbiAgICAgICAgICAgICdiYWNrZ3JvdW5kLWNvbG9yJzogJ3JnYmEoMjU1LDI1NSwyNTUsMC44NSknXHJcbiAgICAgICAgfSxcclxuICAgICAgICBob3ZlckVudGVyU3R5bGU6IHtcclxuICAgICAgICAgICAgZGlzcGxheTogJ2Jsb2NrJ1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgaG92ZXJMZWF2ZVN0eWxlOiB7XHJcbiAgICAgICAgICAgIGRpc3BsYXk6ICdub25lJ1xyXG4gICAgICAgIH1cclxuICAgIH0sIG9wdGlvbnMpO1xyXG4gICAgXHJcbiAgICB2YXIgaG92ZXJFbCA9IHRoaXMuX2VsZW1lbnRzLnBhcmVudC5zZWxlY3QoJy4nICsgb3B0aW9ucy5ob3ZlckNsYXNzTmFtZSk7XHJcblxyXG4gICAgaWYgKCFzcGVjKSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuaG92ZXIobnVsbCwgbnVsbCwgb3B0aW9ucyk7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIGh0bWxGdW5jID0gdGhpcy5idWlsZEhUTUxGdW5jKHNwZWMpO1xyXG4gICAgaWYgKGhvdmVyRWwuZW1wdHkoKSkge1xyXG4gICAgICAgIGhvdmVyRWwgPSB0aGlzLl9lbGVtZW50cy5wYXJlbnQuYXBwZW5kKCdkaXYnKS5hdHRyKCdjbGFzcycsb3B0aW9ucy5ob3ZlckNsYXNzTmFtZSk7XHJcbiAgICB9XHJcbiAgICBob3ZlckVsLnN0eWxlKG9wdGlvbnMuaG92ZXJTdHlsZSk7XHJcbiAgICBpZiAoIWhvdmVyRWwubWFwbWFwX2V2ZW50SGFuZGxlckluc3RhbGxlZCkge1xyXG4gICAgICAgIGhvdmVyRWwub24oJ21vdXNlZW50ZXInLCBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgaG92ZXJFbC5zdHlsZShvcHRpb25zLmhvdmVyRW50ZXJTdHlsZSk7XHJcbiAgICAgICAgfSkub24oJ21vdXNlbGVhdmUnLCBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgaG92ZXJFbC5zdHlsZShvcHRpb25zLmhvdmVyTGVhdmVTdHlsZSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgaG92ZXJFbC5tYXBtYXBfZXZlbnRIYW5kbGVySW5zdGFsbGVkID0gdHJ1ZTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gc2hvdyhkLCBwb2ludCl7XHJcbiAgICAgICAgLy8gb2Zmc2V0UGFyZW50IG9ubHkgd29ya3MgZm9yIHJlbmRlcmVkIG9iamVjdHMsIHNvIHBsYWNlIG9iamVjdCBmaXJzdCFcclxuICAgICAgICAvLyBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvSFRNTEVsZW1lbnQub2Zmc2V0UGFyZW50XHJcbiAgICAgICAgaG92ZXJFbC5zdHlsZShvcHRpb25zLmhvdmVyRW50ZXJTdHlsZSk7ICBcclxuICAgICAgICBcclxuICAgICAgICB2YXIgb2Zmc2V0RWwgPSBob3ZlckVsLm5vZGUoKS5vZmZzZXRQYXJlbnQgfHwgaG92ZXJFbCxcclxuICAgICAgICAgICAgbWFpbkVsID0gdGhpcy5fZWxlbWVudHMubWFpbi5ub2RlKCksXHJcbiAgICAgICAgICAgIGJvdW5kcyA9IHRoaXMuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCksXHJcbiAgICAgICAgICAgIG9mZnNldEJvdW5kcyA9IG9mZnNldEVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLFxyXG4gICAgICAgICAgICBzY3JvbGxUb3AgPSB3aW5kb3cucGFnZVlPZmZzZXQgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnNjcm9sbFRvcCB8fCBkb2N1bWVudC5ib2R5LnNjcm9sbFRvcCB8fCAwLFxyXG4gICAgICAgICAgICBzY3JvbGxMZWZ0ID0gd2luZG93LnBhZ2VYT2Zmc2V0IHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zY3JvbGxMZWZ0IHx8IGRvY3VtZW50LmJvZHkuc2Nyb2xsTGVmdCB8fCAwLFxyXG4gICAgICAgICAgICB0b3AgPSBib3VuZHMudG9wIC0gb2Zmc2V0Qm91bmRzLnRvcCxcclxuICAgICAgICAgICAgbGVmdCA9IGJvdW5kcy5sZWZ0IC0gb2Zmc2V0Qm91bmRzLmxlZnQ7XHJcblxyXG4gICAgICAgIGhvdmVyRWxcclxuICAgICAgICAgICAgLnN0eWxlKHtcclxuICAgICAgICAgICAgICAgIGJvdHRvbTogKG9mZnNldEJvdW5kcy5oZWlnaHQgLSB0b3AgLSBwb2ludC55KSArICdweCcsXHJcbiAgICAgICAgICAgICAgICAvL3RvcDogcG9pbnQueSArICdweCcsXHJcbiAgICAgICAgICAgICAgICBsZWZ0OiAobGVmdCArIHBvaW50LngpICsgJ3B4J1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAuaHRtbChodG1sRnVuYyhkKSk7XHJcbiAgICB9XHJcbiAgICBmdW5jdGlvbiBoaWRlKCkge1xyXG4gICAgICAgIGhvdmVyRWwuc3R5bGUob3B0aW9ucy5ob3ZlckxlYXZlU3R5bGUpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gdGhpcy5ob3ZlcihzaG93LCBoaWRlLCBvcHRpb25zKTtcclxufTtcclxuXHJcbi8vIHJlbW92ZSBhbGwgc3ltYm9sb2d5XHJcbi8vIFRPRE86IHN5bWJvbGl6ZXJzIHNob3VsZCBiZSByZWdpc3RlcmVkIHNvbWVob3cgYW5kIGl0ZXJhdGVkIG92ZXIgaGVyZVxyXG5tYXBtYXAucHJvdG90eXBlLmNsZWFyID0gZnVuY3Rpb24oKSB7XHJcbiAgICB0aGlzLmNob3JvcGxldGgobnVsbCk7XHJcbiAgICB0aGlzLnByb3BvcnRpb25hbF9jaXJjbGVzKG51bGwpO1xyXG4gICAgdGhpcy50aXRsZShudWxsKTtcclxuICAgIHRoaXMuZGVzYyhudWxsKTtcclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxuLy8gbmFtZXNwYWNlIGZvciByZS11c2FibGUgYmVoYXZpb3JzXHJcbm1hcG1hcC5iZWhhdmlvciA9IHt9O1xyXG5cclxubWFwbWFwLmJlaGF2aW9yLnpvb20gPSBmdW5jdGlvbihvcHRpb25zKSB7XHJcblxyXG4gICAgb3B0aW9ucyA9IGRkLm1lcmdlKHtcclxuICAgICAgICBldmVudDogJ2NsaWNrJyxcclxuICAgICAgICBjdXJzb3I6ICdwb2ludGVyJyxcclxuICAgICAgICBmaXRTY2FsZTogMC43LFxyXG4gICAgICAgIGFuaW1hdGlvbkR1cmF0aW9uOiA3NTAsXHJcbiAgICAgICAgbWF4Wm9vbTogOCxcclxuICAgICAgICBoaWVyYXJjaGljYWw6IGZhbHNlLFxyXG4gICAgICAgIHNob3dSaW5nOiB0cnVlLFxyXG4gICAgICAgIHJpbmdSYWRpdXM6IDEuMSwgLy8gcmVsYXRpdmUgdG8gaGVpZ2h0LzJcclxuICAgICAgICB6b29tc3RhcnQ6IG51bGwsXHJcbiAgICAgICAgem9vbWVuZDogbnVsbCxcclxuICAgICAgICBjZW50ZXI6IFtjZW50ZXIueCwgY2VudGVyLnldLFxyXG4gICAgICAgIHJpbmdBdHRyaWJ1dGVzOiB7XHJcbiAgICAgICAgICAgIHN0cm9rZTogJyMwMDAnLFxyXG4gICAgICAgICAgICAnc3Ryb2tlLXdpZHRoJzogNixcclxuICAgICAgICAgICAgJ3N0cm9rZS1vcGFjaXR5JzogMC4zLFxyXG4gICAgICAgICAgICAncG9pbnRlci1ldmVudHMnOiAnbm9uZScsXHJcbiAgICAgICAgICAgIGZpbGw6ICdub25lJ1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgY2xvc2VCdXR0b246IGZ1bmN0aW9uKHBhcmVudCkge1xyXG4gICAgICAgICAgICBwYXJlbnQuYXBwZW5kKCdjaXJjbGUnKVxyXG4gICAgICAgICAgICAgICAgLmF0dHIoe1xyXG4gICAgICAgICAgICAgICAgICAgIHI6IDEwLFxyXG4gICAgICAgICAgICAgICAgICAgIGZpbGw6ICcjZmZmJyxcclxuICAgICAgICAgICAgICAgICAgICBzdHJva2U6ICcjMDAwJyxcclxuICAgICAgICAgICAgICAgICAgICAnc3Ryb2tlLXdpZHRoJzogMi41LFxyXG4gICAgICAgICAgICAgICAgICAgICdzdHJva2Utb3BhY2l0eSc6IDAuOSxcclxuICAgICAgICAgICAgICAgICAgICAnZmlsbC1vcGFjaXR5JzogMC45LFxyXG4gICAgICAgICAgICAgICAgICAgIGN1cnNvcjogJ3BvaW50ZXInXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBwYXJlbnQuYXBwZW5kKCd0ZXh0JylcclxuICAgICAgICAgICAgICAgIC5hdHRyKHtcclxuICAgICAgICAgICAgICAgICAgICAndGV4dC1hbmNob3InOidtaWRkbGUnLFxyXG4gICAgICAgICAgICAgICAgICAgIGN1cnNvcjogJ3BvaW50ZXInLFxyXG4gICAgICAgICAgICAgICAgICAgICdmb250LXdlaWdodCc6ICdib2xkJyxcclxuICAgICAgICAgICAgICAgICAgICAnZm9udC1zaXplJzogJzE4JyxcclxuICAgICAgICAgICAgICAgICAgICB5OiA2XHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgICAgLnRleHQoJ8OXJyk7XHJcbiAgICAgICAgfSxcclxuICAgICAgICAvLyBUT0RPOiBob3cgc2hvdWxkIGhpZ2hsaWdodGluZyB3b3JrIG9uIHRoZSBtYXAgZ2VuZXJhbGx5P1xyXG4gICAgICAgIC8vIG1heWJlIG1vcmUgbGlrZSBzZXRTdGF0ZSgnaGlnaGxpZ2h0JykgYW5kIG9wdGlvbnMuYWN0aXZlc3R5bGUgPSAnaGlnaGxpZ2h0JyA/XHJcbiAgICAgICAgYWN0aXZhdGU6IGZ1bmN0aW9uKGVsKSB7XHJcbiAgICAgICAgICAgIGQzLnNlbGVjdChlbCkuY2xhc3NlZCgnYWN0aXZlJywgdHJ1ZSk7XHJcbiAgICAgICAgfSxcclxuICAgICAgICBkZWFjdGl2YXRlOiBmdW5jdGlvbihlbCkge1xyXG4gICAgICAgICAgICBpZiAoZWwpIGQzLnNlbGVjdChlbCkuY2xhc3NlZCgnYWN0aXZlJywgZmFsc2UpO1xyXG4gICAgICAgIH0gICAgICAgIFxyXG4gICAgfSwgb3B0aW9ucyk7XHJcbiAgICBcclxuICAgIHZhciByaW5nID0gbnVsbCxcclxuICAgICAgICBtYXAgPSBudWxsLFxyXG4gICAgICAgIHIsIHIwLFxyXG4gICAgICAgIHpvb21lZCA9IG51bGw7XHJcbiAgICBcclxuICAgIHZhciB6ID0gZnVuY3Rpb24oc2VsZWN0aW9uKSB7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIG1hcCA9IHRoaXM7XHJcblxyXG4gICAgICAgIHZhciBzaXplID0gdGhpcy5zaXplKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgciA9IE1hdGgubWluKHNpemUuaGVpZ2h0LCBzaXplLndpZHRoKSAvIDIuMCAqIG9wdGlvbnMucmluZ1JhZGl1cztcclxuICAgICAgICByMCA9IE1hdGguc3FydChzaXplLndpZHRoKnNpemUud2lkdGggKyBzaXplLmhlaWdodCpzaXplLmhlaWdodCkgLyAxLjU7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIGlmIChvcHRpb25zLmN1cnNvcikge1xyXG4gICAgICAgICAgICBzZWxlY3Rpb24uYXR0cih7XHJcbiAgICAgICAgICAgICAgICBjdXJzb3I6IG9wdGlvbnMuY3Vyc29yXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAob3B0aW9ucy5zaG93UmluZyAmJiAhcmluZykge1xyXG4gICAgICAgICAgICByaW5nID0gbWFwLl9lbGVtZW50cy5maXhlZC5zZWxlY3RBbGwoJ2cuem9vbVJpbmcnKVxyXG4gICAgICAgICAgICAgICAgLmRhdGEoWzFdKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBuZXdyaW5nID0gcmluZy5lbnRlcigpXHJcbiAgICAgICAgICAgICAgICAuYXBwZW5kKCdnJylcclxuICAgICAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsJ3pvb21SaW5nJylcclxuICAgICAgICAgICAgICAgIC5hdHRyKCd0cmFuc2Zvcm0nLCd0cmFuc2xhdGUoJyArIHNpemUud2lkdGggKiBvcHRpb25zLmNlbnRlclswXSArICcsJyArIHNpemUuaGVpZ2h0ICogb3B0aW9ucy5jZW50ZXJbMV0gKyAnKScpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBuZXdyaW5nLmFwcGVuZCgnY2lyY2xlJylcclxuICAgICAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdtYWluJylcclxuICAgICAgICAgICAgICAgIC5hdHRyKCdyJywgcjApXHJcbiAgICAgICAgICAgICAgICAuYXR0cihvcHRpb25zLnJpbmdBdHRyaWJ1dGVzKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgY2xvc2UgPSBuZXdyaW5nLmFwcGVuZCgnZycpXHJcbiAgICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCd6b29tT3V0JylcclxuICAgICAgICAgICAgICAgIC5hdHRyKCd0cmFuc2Zvcm0nLCd0cmFuc2xhdGUoJyArIChyMCAqIDAuNzA3KSArICcsLScgKyAocjAgKiAwLjcwNykgKyAnKScpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKG9wdGlvbnMuY2xvc2VCdXR0b24pIHtcclxuICAgICAgICAgICAgICAgIG9wdGlvbnMuY2xvc2VCdXR0b24oY2xvc2UpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gdGhpcyBpcyBjdXJyZW50bHkgbmVlZGVkIGlmIGUuZy4gc2VhcmNoIHpvb21zIHRvIHNvbWV3aGVyZSBlbHNlLFxyXG4gICAgICAgIC8vIGJ1dCBtYXAgaXMgc3RpbGwgem9vbWVkIGluIHRocm91Z2ggdGhpcyBiZWhhdmlvclxyXG4gICAgICAgIC8vIGRvIGEgcmVzZXQoKSwgYnV0IHdpdGhvdXQgbW9kaWZ5aW5nIHRoZSBtYXAgdmlldyAoPXpvb21pbmcgb3V0KVxyXG4gICAgICAgIG1hcC5vbigndmlldycsIGZ1bmN0aW9uKHRyYW5zbGF0ZSwgc2NhbGUpIHtcclxuICAgICAgICAgICAgaWYgKHpvb21lZCAmJiBzY2FsZSA9PSAxKSB7XHJcbiAgICAgICAgICAgICAgICB6b29tZWQgPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgYW5pbWF0ZVJpbmcobnVsbCk7XHJcbiAgICAgICAgICAgICAgICBtYXAuX2VsZW1lbnRzLm1hcC5zZWxlY3QoJy5iYWNrZ3JvdW5kJykub24ob3B0aW9ucy5ldmVudCArICcuem9vbScsIG51bGwpO1xyXG4gICAgICAgICAgICAgICAgb3B0aW9ucy56b29tc3RhcnQgJiYgb3B0aW9ucy56b29tc3RhcnQuY2FsbChtYXAsIG51bGwpO1xyXG4gICAgICAgICAgICAgICAgb3B0aW9ucy56b29tZW5kICYmIG9wdGlvbnMuem9vbWVuZC5jYWxsKG1hcCwgbnVsbCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgIHNlbGVjdGlvbi5vbihvcHRpb25zLmV2ZW50LCBmdW5jdGlvbihkKSB7XHJcbiAgICAgICAgICAgIGNhbGxIb3Zlck91dCgpO1xyXG4gICAgICAgICAgICBpZiAoem9vbWVkID09IHRoaXMpIHtcclxuICAgICAgICAgICAgICAgIHJlc2V0KCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLmRlYWN0aXZhdGUoem9vbWVkKTtcclxuICAgICAgICAgICAgICAgIHZhciBlbCA9IHRoaXM7XHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLnpvb21zdGFydCAmJiBvcHRpb25zLnpvb21zdGFydC5jYWxsKG1hcCwgZWwpO1xyXG4gICAgICAgICAgICAgICAgbWFwLnpvb21Ub1NlbGVjdGlvbih0aGlzLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2s6IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zLnpvb21lbmQgJiYgb3B0aW9ucy56b29tZW5kLmNhbGwobWFwLCBlbCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgICAgICBtYXhab29tOiBvcHRpb25zLm1heFpvb20sXHJcbiAgICAgICAgICAgICAgICAgICAgY2VudGVyOiBvcHRpb25zLmNlbnRlclxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICBhbmltYXRlUmluZyh0aGlzKTtcclxuICAgICAgICAgICAgICAgIG9wdGlvbnMuYWN0aXZhdGUodGhpcyk7XHJcbiAgICAgICAgICAgICAgICB6b29tZWQgPSB0aGlzO1xyXG4gICAgICAgICAgICAgICAgbWFwLl9lbGVtZW50cy5tYXAuc2VsZWN0KCcuYmFja2dyb3VuZCcpLm9uKG9wdGlvbnMuZXZlbnQgKyAnLnpvb20nLCByZXNldCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgaWYgKHpvb21lZCkge1xyXG4gICAgICAgICAgICBvcHRpb25zLnpvb21zdGFydCAmJiBvcHRpb25zLnpvb21zdGFydC5jYWxsKG1hcCwgem9vbWVkKTtcclxuICAgICAgICAgICAgb3B0aW9ucy56b29tZW5kICYmIG9wdGlvbnMuem9vbWVuZC5jYWxsKG1hcCwgem9vbWVkKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gem9vbVRvKHNlbGVjdGlvbikge1xyXG4gICAgICAgIG9wdGlvbnMuem9vbXN0YXJ0ICYmIG9wdGlvbnMuem9vbXN0YXJ0LmNhbGwobWFwLCBzZWxlY3Rpb24pO1xyXG4gICAgICAgIG1hcC56b29tVG9TZWxlY3Rpb24oc2VsZWN0aW9uLCB7XHJcbiAgICAgICAgICAgIGNhbGxiYWNrOiBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgIG9wdGlvbnMuem9vbWVuZCAmJiBvcHRpb25zLnpvb21lbmQuY2FsbChtYXAsIHNlbGVjdGlvbik7XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIG1heFpvb206IG9wdGlvbnMubWF4Wm9vbSxcclxuICAgICAgICAgICAgY2VudGVyOiBvcHRpb25zLmNlbnRlclxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGFuaW1hdGVSaW5nKHNlbGVjdGlvbik7XHJcbiAgICAgICAgem9vbWVkID0gc2VsZWN0aW9uO1xyXG4gICAgICAgIG1hcC5fZWxlbWVudHMubWFwLnNlbGVjdCgnLmJhY2tncm91bmQnKS5vbihvcHRpb25zLmV2ZW50ICsgJy56b29tJywgcmVzZXQpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGFuaW1hdGVSaW5nKHNlbGVjdGlvbikge1xyXG4gICAgICAgIGlmIChyaW5nKSB7XHJcbiAgICAgICAgICAgIHZhciBuZXdfciA9IChzZWxlY3Rpb24pID8gciA6IHIwO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmluZy5zZWxlY3QoJ2NpcmNsZS5tYWluJykudHJhbnNpdGlvbigpLmR1cmF0aW9uKG9wdGlvbnMuYW5pbWF0aW9uRHVyYXRpb24pXHJcbiAgICAgICAgICAgICAgICAuYXR0cih7XHJcbiAgICAgICAgICAgICAgICAgICAgcjogbmV3X3JcclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIDtcclxuICAgICAgICAgICAgcmluZy5zZWxlY3QoJ2cuem9vbU91dCcpLnRyYW5zaXRpb24oKS5kdXJhdGlvbihvcHRpb25zLmFuaW1hdGlvbkR1cmF0aW9uKVxyXG4gICAgICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsICd0cmFuc2xhdGUoJyArIChuZXdfciAqIDAuNzA3KSArICcsLScgKyAobmV3X3IgKiAwLjcwNykgKyAnKScpOyAvLyBzcXJ0KDIpIC8gMlxyXG5cclxuICAgICAgICAgICAgLy8gY2F2ZWF0OiBtYWtlIHN1cmUgdG8gYXNzaWduIHRoaXMgZXZlcnkgdGltZSB0byBhcHBseSBjb3JyZWN0IGNsb3N1cmUgaWYgd2UgaGF2ZSBtdWx0aXBsZSB6b29tIGJlaGF2aW9ycyEhXHJcbiAgICAgICAgICAgIHJpbmcuc2VsZWN0KCdnLnpvb21PdXQnKS5vbignY2xpY2snLCByZXNldCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgICAgIFxyXG4gICAgZnVuY3Rpb24gcmVzZXQoKSB7XHJcbiAgICAgICAgaWYgKG1hcCkge1xyXG4gICAgICAgICAgICBvcHRpb25zLmRlYWN0aXZhdGUoem9vbWVkKTtcclxuICAgICAgICAgICAgem9vbWVkID0gbnVsbDtcclxuICAgICAgICAgICAgbWFwLnJlc2V0Wm9vbSgpO1xyXG4gICAgICAgICAgICBhbmltYXRlUmluZyhudWxsKTtcclxuICAgICAgICAgICAgbWFwLl9lbGVtZW50cy5tYXAuc2VsZWN0KCcuYmFja2dyb3VuZCcpLm9uKG9wdGlvbnMuZXZlbnQgKyAnLnpvb20nLCBudWxsKTtcclxuICAgICAgICAgICAgaWYgKG9wdGlvbnMuem9vbXN0YXJ0KSB7XHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLnpvb21zdGFydC5jYWxsKG1hcCwgbnVsbCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKG9wdGlvbnMuem9vbWVuZCkge1xyXG4gICAgICAgICAgICAgICAgb3B0aW9ucy56b29tZW5kLmNhbGwobWFwLCBudWxsKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgei5yZXNldCA9IHJlc2V0O1xyXG4gICAgXHJcbiAgICB6LmFjdGl2ZSA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJldHVybiB6b29tZWQ7XHJcbiAgICB9OyAgIFxyXG5cclxuICAgIHoucmVtb3ZlID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgcmVzZXQoKTtcclxuICAgIH07XHJcbiAgICAgICAgXHJcbiAgICB6LmZyb20gPSBmdW5jdGlvbihvdGhlcil7XHJcbiAgICAgICAgaWYgKG90aGVyICYmIG90aGVyLmFjdGl2ZSkge1xyXG4gICAgICAgICAgICB6b29tZWQgPSBvdGhlci5hY3RpdmUoKTtcclxuICAgICAgICAgICAgLypcclxuICAgICAgICAgICAgaWYgKHpvb21lZCkge1xyXG4gICAgICAgICAgICAgICAgem9vbVRvKHpvb21lZCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgKi9cclxuICAgICAgICAgICAgLy8gVE9ETzogbWFrZSB1cCBvdXIgbWluZCB3aGV0aGVyIHRoaXMgc2hvdWxkIHJlbW92ZSB0aGUgb3RoZXIgYmVoYXZpb3JcclxuICAgICAgICAgICAgLy8gaW4gYnVyZ2VubGFuZF9kZW1vZ3JhcGhpZS5odG1sLCB3ZSBuZWVkIHRvIGtlZXAgaXQgYXMgaXQgd291bGQgb3RoZXJ3aXNlIHpvb20gb3V0XHJcbiAgICAgICAgICAgIC8vIGJ1dCBpZiB3ZSBtaXggZGlmZmVyZW50IGJlaGF2aW9ycywgd2UgbWF5IHdhbnQgdG8gcmVtb3ZlIHRoZSBvdGhlciBvbmUgYXV0b21hdGljYWxseVxyXG4gICAgICAgICAgICAvLyAob3IgbWF5YmUgcmVxdWlyZSBpdCB0byBiZSBkb25lIG1hbnVhbGx5KVxyXG4gICAgICAgICAgICAvLyBpbiBwZW5kZWxuLmpzLCB3ZSByZW1vdmUgdGhlIG90aGVyIGJlaGF2aW9yIGhlcmUsIHdoaWNoIGlzIGluY29uc2lzdGVudCFcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vb3RoZXIucmVtb3ZlKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB6O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHo7XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLmFuaW1hdGVWaWV3ID0gZnVuY3Rpb24odHJhbnNsYXRlLCBzY2FsZSwgY2FsbGJhY2ssIGR1cmF0aW9uKSB7XHJcblxyXG4gICAgZHVyYXRpb24gPSBkdXJhdGlvbiB8fCA3NTA7XHJcbiAgICBcclxuICAgIGlmICh0cmFuc2xhdGVbMF0gPT0gdGhpcy5jdXJyZW50X3RyYW5zbGF0ZVswXSAmJiB0cmFuc2xhdGVbMV0gPT0gdGhpcy5jdXJyZW50X3RyYW5zbGF0ZVsxXSAmJiBzY2FsZSA9PSB0aGlzLmN1cnJlbnRfc2NhbGUpIHtcclxuICAgICAgICAvLyBub3RoaW5nIHRvIGRvXHJcbiAgICAgICAgLy8geWllbGQgdG8gc2ltdWxhdGUgYXN5bmMgY2FsbGJhY2tcclxuICAgICAgICBpZiAoY2FsbGJhY2spIHtcclxuICAgICAgICAgICAgd2luZG93LnNldFRpbWVvdXQoY2FsbGJhY2ssIDEwKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcbiAgICB0aGlzLmN1cnJlbnRfdHJhbnNsYXRlID0gdHJhbnNsYXRlO1xyXG4gICAgdGhpcy5jdXJyZW50X3NjYWxlID0gc2NhbGU7XHJcbiAgICBjYWxsSG92ZXJPdXQoKTtcclxuICAgIHZhciBtYXAgPSB0aGlzO1xyXG4gICAgdGhpcy5fZWxlbWVudHMubWFwLnRyYW5zaXRpb24oKVxyXG4gICAgICAgIC5kdXJhdGlvbihkdXJhdGlvbilcclxuICAgICAgICAuY2FsbChtYXAuem9vbS50cmFuc2xhdGUodHJhbnNsYXRlKS5zY2FsZShzY2FsZSkuZXZlbnQpXHJcbiAgICAgICAgLmVhY2goJ3N0YXJ0JywgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIG1hcC5fZWxlbWVudHMuc2hhZG93R3JvdXAuYXR0cignZGlzcGxheScsJ25vbmUnKTtcclxuICAgICAgICB9KVxyXG4gICAgICAgIC5lYWNoKCdlbmQnLCBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgbWFwLl9lbGVtZW50cy5zaGFkb3dHcm91cC5hdHRyKCdkaXNwbGF5JywnYmxvY2snKTtcclxuICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSB7XHJcbiAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSlcclxuICAgICAgICAuZWFjaCgnaW50ZXJydXB0JywgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIG1hcC5fZWxlbWVudHMuc2hhZG93R3JvdXAuYXR0cignZGlzcGxheScsJ2Jsb2NrJyk7XHJcbiAgICAgICAgICAgIC8vIG5vdCBzdXJlIGlmIHdlIHNob3VsZCBjYWxsIGNhbGxiYWNrIGhlcmUsIGJ1dCBpdCBtYXkgYmUgbm9uLWludHVpdGl2ZVxyXG4gICAgICAgICAgICAvLyBmb3IgY2FsbGJhY2sgdG8gbmV2ZXIgYmUgY2FsbGVkIGlmIHpvb20gaXMgY2FuY2VsbGVkXHJcbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykge1xyXG4gICAgICAgICAgICAgICAgY2FsbGJhY2soKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pOyAgICAgICAgXHJcbiAgICB0aGlzLmRpc3BhdGNoZXIudmlldy5jYWxsKHRoaXMsIHRyYW5zbGF0ZSwgc2NhbGUpO1xyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLnNldFZpZXcgPSBmdW5jdGlvbih0cmFuc2xhdGUsIHNjYWxlKSB7XHJcblxyXG4gICAgdHJhbnNsYXRlID0gdHJhbnNsYXRlIHx8IHRoaXMuY3VycmVudF90cmFuc2xhdGU7XHJcbiAgICBzY2FsZSA9IHNjYWxlIHx8IHRoaXMuY3VycmVudF9zY2FsZTtcclxuICAgIFxyXG4gICAgdGhpcy5jdXJyZW50X3RyYW5zbGF0ZSA9IHRyYW5zbGF0ZTtcclxuICAgIHRoaXMuY3VycmVudF9zY2FsZSA9IHNjYWxlO1xyXG4gICAgICBcclxuICAgIC8vIGRvIHdlIG5lZWQgdGhpcz9cclxuICAgIC8vY2FsbEhvdmVyT3V0KCk7XHJcblxyXG4gICAgdGhpcy56b29tLnRyYW5zbGF0ZSh0cmFuc2xhdGUpLnNjYWxlKHNjYWxlKS5ldmVudCh0aGlzLl9lbGVtZW50cy5tYXApO1xyXG5cclxuICAgIHRoaXMuZGlzcGF0Y2hlci52aWV3LmNhbGwodGhpcywgdHJhbnNsYXRlLCBzY2FsZSk7XHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuZ2V0VmlldyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0cmFuc2xhdGU6IHRoaXMuY3VycmVudF90cmFuc2xhdGUsXHJcbiAgICAgICAgc2NhbGU6IHRoaXMuY3VycmVudF9zY2FsZVxyXG4gICAgfVxyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS56b29tVG9TZWxlY3Rpb24gPSBmdW5jdGlvbihzZWxlY3Rpb24sIG9wdGlvbnMpIHtcclxuICAgIFxyXG4gICAgb3B0aW9ucyA9IGRkLm1lcmdlKHtcclxuICAgICAgICBmaXRTY2FsZTogMC43LFxyXG4gICAgICAgIGFuaW1hdGlvbkR1cmF0aW9uOiA3NTAsXHJcbiAgICAgICAgbWF4Wm9vbTogOCxcclxuICAgICAgICBjZW50ZXI6IFtjZW50ZXIueCwgY2VudGVyLnldXHJcbiAgICB9LCBvcHRpb25zKTtcclxuXHJcbiAgICB2YXIgc2VsID0gdGhpcy5nZXRSZXByZXNlbnRhdGlvbnMoc2VsZWN0aW9uKSxcclxuICAgICAgICBib3VuZHMgPSBbW0luZmluaXR5LEluZmluaXR5XSxbLUluZmluaXR5LCAtSW5maW5pdHldXSxcclxuICAgICAgICBwYXRoR2VuZXJhdG9yID0gZDMuZ2VvLnBhdGgoKS5wcm9qZWN0aW9uKHRoaXMuX3Byb2plY3Rpb24pOyAgICBcclxuICAgIFxyXG4gICAgc2VsLmVhY2goZnVuY3Rpb24oZWwpe1xyXG4gICAgICAgIHZhciBiID0gcGF0aEdlbmVyYXRvci5ib3VuZHMoZWwpO1xyXG4gICAgICAgIGJvdW5kc1swXVswXSA9IE1hdGgubWluKGJvdW5kc1swXVswXSwgYlswXVswXSk7XHJcbiAgICAgICAgYm91bmRzWzBdWzFdID0gTWF0aC5taW4oYm91bmRzWzBdWzFdLCBiWzBdWzFdKTtcclxuICAgICAgICBib3VuZHNbMV1bMF0gPSBNYXRoLm1heChib3VuZHNbMV1bMF0sIGJbMV1bMF0pO1xyXG4gICAgICAgIGJvdW5kc1sxXVsxXSA9IE1hdGgubWF4KGJvdW5kc1sxXVsxXSwgYlsxXVsxXSk7XHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgdmFyIGR4ID0gYm91bmRzWzFdWzBdIC0gYm91bmRzWzBdWzBdLFxyXG4gICAgICAgIGR5ID0gYm91bmRzWzFdWzFdIC0gYm91bmRzWzBdWzFdLFxyXG4gICAgICAgIHggPSAoYm91bmRzWzBdWzBdICsgYm91bmRzWzFdWzBdKSAvIDIsXHJcbiAgICAgICAgeSA9IChib3VuZHNbMF1bMV0gKyBib3VuZHNbMV1bMV0pIC8gMixcclxuICAgICAgICBzaXplID0gdGhpcy5zaXplKCksXHJcbiAgICAgICAgc2NhbGUgPSBNYXRoLm1pbihvcHRpb25zLm1heFpvb20sIG9wdGlvbnMuZml0U2NhbGUgLyBNYXRoLm1heChkeCAvIHNpemUud2lkdGgsIGR5IC8gc2l6ZS5oZWlnaHQpKSxcclxuICAgICAgICB0cmFuc2xhdGUgPSBbc2l6ZS53aWR0aCAqIG9wdGlvbnMuY2VudGVyWzBdIC0gc2NhbGUgKiB4LCBzaXplLmhlaWdodCAqIG9wdGlvbnMuY2VudGVyWzFdIC0gc2NhbGUgKiB5XTtcclxuICAgIHRoaXMuYW5pbWF0ZVZpZXcodHJhbnNsYXRlLCBzY2FsZSwgb3B0aW9ucy5jYWxsYmFjaywgb3B0aW9ucy5hbmltYXRpb25EdXJhdGlvbik7XHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuem9vbVRvQm91bmRzID0gZnVuY3Rpb24oYm91bmRzLCBjYWxsYmFjaywgZHVyYXRpb24pIHtcclxuICAgIHZhciB3ID0gYm91bmRzWzFdWzBdLWJvdW5kc1swXVswXSxcclxuICAgICAgICBoID0gYm91bmRzWzFdWzFdLWJvdW5kc1swXVsxXSxcclxuICAgICAgICBjeCA9IChib3VuZHNbMV1bMF0rYm91bmRzWzBdWzBdKSAvIDIsXHJcbiAgICAgICAgY3kgPSAoYm91bmRzWzFdWzFdK2JvdW5kc1swXVsxXSkgLyAyLFxyXG4gICAgICAgIHNpemUgPSB0aGlzLnNpemUoKSxcclxuICAgICAgICBzY2FsZSA9IE1hdGgubWluKDIsIDAuOSAvIE1hdGgubWF4KHcgLyBzaXplLndpZHRoLCBoIC8gc2l6ZS5oZWlnaHQpKSxcclxuICAgICAgICB0cmFuc2xhdGUgPSBbc2l6ZS53aWR0aCAqIDAuNSAtIHNjYWxlICogY3gsIHNpemUuaGVpZ2h0ICogMC41IC0gc2NhbGUgKiBjeV07XHJcbiAgICBcclxuICAgIHJldHVybiB0aGlzLmFuaW1hdGVWaWV3KHRyYW5zbGF0ZSwgc2NhbGUsIGNhbGxiYWNrLCBkdXJhdGlvbik7XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLnpvb21Ub0NlbnRlciA9IGZ1bmN0aW9uKGNlbnRlciwgc2NhbGUsIGNhbGxiYWNrLCBkdXJhdGlvbikge1xyXG5cclxuICAgIHNjYWxlID0gc2NhbGUgfHwgMTtcclxuICAgIFxyXG4gICAgdmFyIHNpemUgPSB0aGlzLnNpemUoKSxcclxuICAgICAgICB0cmFuc2xhdGUgPSBbc2l6ZS53aWR0aCAqIDAuNSAtIHNjYWxlICogY2VudGVyWzBdLCBzaXplLmhlaWdodCAqIDAuNSAtIHNjYWxlICogY2VudGVyWzFdXTtcclxuXHJcbiAgICByZXR1cm4gdGhpcy5hbmltYXRlVmlldyh0cmFuc2xhdGUsIHNjYWxlLCBjYWxsYmFjaywgZHVyYXRpb24pO1xyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS56b29tVG9WaWV3cG9ydFBvc2l0aW9uID0gZnVuY3Rpb24oY2VudGVyLCBzY2FsZSwgY2FsbGJhY2ssIGR1cmF0aW9uKSB7XHJcblxyXG4gICAgdmFyIHBvaW50ID0gdGhpcy5fZWxlbWVudHMubWFpbi5ub2RlKCkuY3JlYXRlU1ZHUG9pbnQoKTtcclxuXHJcbiAgICBwb2ludC54ID0gY2VudGVyWzBdO1xyXG4gICAgcG9pbnQueSA9IGNlbnRlclsxXTtcclxuXHJcbiAgICB2YXIgY3RtID0gdGhpcy5fZWxlbWVudHMuZ2VvbWV0cnkubm9kZSgpLmdldFNjcmVlbkNUTSgpLmludmVyc2UoKTtcclxuICAgIHBvaW50ID0gcG9pbnQubWF0cml4VHJhbnNmb3JtKGN0bSk7XHJcblxyXG4gICAgcG9pbnQgPSBbcG9pbnQueCwgcG9pbnQueV07XHJcbiAgICBcclxuICAgIHNjYWxlID0gc2NhbGUgfHwgMTtcclxuICAgIFxyXG4gICAgLy92YXIgcG9pbnQgPSBbKGNlbnRlclswXS10aGlzLmN1cnJlbnRfdHJhbnNsYXRlWzBdKS90aGlzLmN1cnJlbnRfc2NhbGUsIChjZW50ZXJbMV0tdGhpcy5jdXJyZW50X3RyYW5zbGF0ZVsxXSkvdGhpcy5jdXJyZW50X3NjYWxlXTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHRoaXMuem9vbVRvQ2VudGVyKHBvaW50LCBzY2FsZSwgY2FsbGJhY2ssIGR1cmF0aW9uKTtcclxufTtcclxuXHJcbm1hcG1hcC5wcm90b3R5cGUucmVzZXRab29tID0gZnVuY3Rpb24oY2FsbGJhY2ssIGR1cmF0aW9uKSB7XHJcbiAgICByZXR1cm4gdGhpcy5hbmltYXRlVmlldyhbMCwwXSwxLCBjYWxsYmFjaywgZHVyYXRpb24pO1xyXG4gICAgLy8gVE9ETyB0YWtlIGNlbnRlciBpbnRvIGFjY291bnQgem9vbWVkLW91dCwgd2UgbWF5IG5vdCBhbHdheXMgd2FudCB0aGlzP1xyXG4gICAgLy9kb1pvb20oW3dpZHRoICogKGNlbnRlci54LTAuNSksaGVpZ2h0ICogKGNlbnRlci55LTAuNSldLDEpO1xyXG59O1xyXG5cclxuXHJcbi8vIE1hbmlwdWxhdGUgcmVwcmVzZW50YXRpb24gZ2VvbWV0cnkuIFRoaXMgY2FuIGJlIHVzZWQgZS5nLiB0byByZWdpc3RlciBldmVudCBoYW5kbGVycy5cclxuLy8gc3BlYyBpcyBhIGZ1bmN0aW9uIHRvIGJlIGNhbGxlZCB3aXRoIHNlbGVjdGlvbiB0byBzZXQgdXAgZXZlbnQgaGFuZGxlclxyXG5tYXBtYXAucHJvdG90eXBlLmFwcGx5QmVoYXZpb3IgPSBmdW5jdGlvbihzcGVjLCBzZWxlY3Rpb24pIHtcclxuXHJcbiAgICBhc3NlcnQoZGQuaXNGdW5jdGlvbihzcGVjKSwgXCJCZWhhdmlvciBtdXN0IGJlIGEgZnVuY3Rpb25cIik7XHJcbiAgICBcclxuICAgIHZhciBtYXAgPSB0aGlzO1xyXG4gICAgdGhpcy5fcHJvbWlzZS5nZW9tZXRyeS50aGVuKGZ1bmN0aW9uKHRvcG8pIHtcclxuICAgICAgICB2YXIgc2VsID0gbWFwLmdldFJlcHJlc2VudGF0aW9ucyhzZWxlY3Rpb24pO1xyXG4gICAgICAgIC8vIFRPRE86IHRoaXMgc2hvdWxkIGJlIGNvbmZpZ3VyYWJsZSB2aWEgb3B0aW9uc1xyXG4gICAgICAgIC8vIGFuZCBuZWVkcyB0byBpbnRlZ3JhdGUgd2l0aCBtYW5hZ2luZyBwb2ludGVyIGV2ZW50cyAoc2VlIGhvdmVySW5mbylcclxuICAgICAgICBzZWwuc3R5bGUoJ3BvaW50ZXItZXZlbnRzJywndmlzaWJsZVBhaW50ZWQnKTtcclxuICAgICAgICBzcGVjLmNhbGwobWFwLCBzZWwpO1xyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcblxyXG4vLyBhcHBseSBhIGJlaGF2aW9yIG9uIHRoZSB3aG9sZSBtYXAgcGFuZSAoZS5nLiBkcmFnL3pvb20gZXRjLilcclxubWFwbWFwLnByb3RvdHlwZS5hcHBseU1hcEJlaGF2aW9yID0gZnVuY3Rpb24oc3BlYykge1xyXG4gICAgc3BlYy5jYWxsKHRoaXMsIHRoaXMuX2VsZW1lbnRzLm1hcCk7XHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcblxyXG4vLyBkZXByZWNhdGVkIG1ldGhvZHMgdXNpbmcgVUstc3BlbGxpbmdcclxubWFwbWFwLnByb3RvdHlwZS5hcHBseUJlaGF2aW91ciA9IGZ1bmN0aW9uKHNwZWMsIHNlbGVjdGlvbikge1xyXG4gICAgY29uc29sZSAmJiBjb25zb2xlLmxvZyAmJiBjb25zb2xlLmxvZyhcIkRlcHJlY2F0aW9uIHdhcm5pbmc6IGFwcGx5QmVoYXZpb3VyKCkgaXMgZGVwcmVjYXRlZCwgdXNlIGFwcGx5QmVoYXZpb3IoKSAoVVMgc3BlbGxpbmcpIGluc3RlYWQhXCIpO1xyXG4gICAgcmV0dXJuIHRoaXMuYXBwbHlCZWhhdmlvcihzcGVjLCBzZWxlY3Rpb24pO1xyXG59XHJcbm1hcG1hcC5wcm90b3R5cGUuYXBwbHlNYXBCZWhhdmlvdXIgPSBmdW5jdGlvbihzcGVjLCBzZWxlY3Rpb24pIHtcclxuICAgIGNvbnNvbGUgJiYgY29uc29sZS5sb2cgJiYgY29uc29sZS5sb2coXCJEZXByZWNhdGlvbiB3YXJuaW5nOiBhcHBseU1hcEJlaGF2aW91cigpIGlzIGRlcHJlY2F0ZWQsIHVzZSBhcHBseU1hcEJlaGF2aW9yKCkgKFVTIHNwZWxsaW5nKSBpbnN0ZWFkIVwiKTtcclxuICAgIHJldHVybiB0aGlzLmFwcGx5TWFwQmVoYXZpb3Ioc3BlYywgc2VsZWN0aW9uKTtcclxufVxyXG5cclxuLy8gaGFuZGxlciBmb3IgaGlnaC1sZXZlbCBldmVudHMgb24gdGhlIG1hcCBvYmplY3RcclxubWFwbWFwLnByb3RvdHlwZS5vbiA9IGZ1bmN0aW9uKGV2ZW50TmFtZSwgaGFuZGxlcikge1xyXG4gICAgdGhpcy5kaXNwYXRjaGVyLm9uKGV2ZW50TmFtZSwgaGFuZGxlcik7XHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbmZ1bmN0aW9uIGRlZmF1bHRSYW5nZUxhYmVsKGxvd2VyLCB1cHBlciwgZm9ybWF0LCBleGNsdWRlTG93ZXIsIGV4Y2x1ZGVVcHBlcikge1xyXG4gICAgdmFyIGYgPSBmb3JtYXQgfHwgZnVuY3Rpb24obG93ZXIpe3JldHVybiBsb3dlcn07XHJcbiAgICAgICAgXHJcbiAgICBpZiAoaXNOYU4obG93ZXIpKSB7XHJcbiAgICAgICAgaWYgKGlzTmFOKHVwcGVyKSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJyYW5nZUxhYmVsOiBuZWl0aGVyIGxvd2VyIG5vciB1cHBlciB2YWx1ZSBzcGVjaWZpZWQhXCIpO1xyXG4gICAgICAgICAgICByZXR1cm4gXCJcIjtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIHJldHVybiAoZXhjbHVkZVVwcGVyID8gXCJ1bmRlciBcIiA6IFwidXAgdG8gXCIpICsgZih1cHBlcik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgaWYgKGlzTmFOKHVwcGVyKSkge1xyXG4gICAgICAgIHJldHVybiBleGNsdWRlTG93ZXIgPyAoXCJtb3JlIHRoYW4gXCIgKyBmKGxvd2VyKSkgOiAoZihsb3dlcikgKyBcIiBhbmQgbW9yZVwiKTtcclxuICAgIH1cclxuICAgIHJldHVybiAoZXhjbHVkZUxvd2VyID8gJz4gJyA6ICcnKSArIGYobG93ZXIpICsgXCIgdG8gXCIgKyAoZXhjbHVkZVVwcGVyID8gJzwnIDogJycpICsgZih1cHBlcik7XHJcbn1cclxuXHJcbnZhciBkM19sb2NhbGVzID0ge1xyXG4gICAgJ2VuJzoge1xyXG4gICAgICAgIGRlY2ltYWw6IFwiLlwiLFxyXG4gICAgICAgIHRob3VzYW5kczogXCIsXCIsXHJcbiAgICAgICAgZ3JvdXBpbmc6IFsgMyBdLFxyXG4gICAgICAgIGN1cnJlbmN5OiBbIFwiJFwiLCBcIlwiIF0sXHJcbiAgICAgICAgZGF0ZVRpbWU6IFwiJWEgJWIgJWUgJVggJVlcIixcclxuICAgICAgICBkYXRlOiBcIiVtLyVkLyVZXCIsXHJcbiAgICAgICAgdGltZTogXCIlSDolTTolU1wiLFxyXG4gICAgICAgIHBlcmlvZHM6IFsgXCJBTVwiLCBcIlBNXCIgXSxcclxuICAgICAgICBkYXlzOiBbIFwiU3VuZGF5XCIsIFwiTW9uZGF5XCIsIFwiVHVlc2RheVwiLCBcIldlZG5lc2RheVwiLCBcIlRodXJzZGF5XCIsIFwiRnJpZGF5XCIsIFwiU2F0dXJkYXlcIiBdLFxyXG4gICAgICAgIHNob3J0RGF5czogWyBcIlN1blwiLCBcIk1vblwiLCBcIlR1ZVwiLCBcIldlZFwiLCBcIlRodVwiLCBcIkZyaVwiLCBcIlNhdFwiIF0sXHJcbiAgICAgICAgbW9udGhzOiBbIFwiSmFudWFyeVwiLCBcIkZlYnJ1YXJ5XCIsIFwiTWFyY2hcIiwgXCJBcHJpbFwiLCBcIk1heVwiLCBcIkp1bmVcIiwgXCJKdWx5XCIsIFwiQXVndXN0XCIsIFwiU2VwdGVtYmVyXCIsIFwiT2N0b2JlclwiLCBcIk5vdmVtYmVyXCIsIFwiRGVjZW1iZXJcIiBdLFxyXG4gICAgICAgIHNob3J0TW9udGhzOiBbIFwiSmFuXCIsIFwiRmViXCIsIFwiTWFyXCIsIFwiQXByXCIsIFwiTWF5XCIsIFwiSnVuXCIsIFwiSnVsXCIsIFwiQXVnXCIsIFwiU2VwXCIsIFwiT2N0XCIsIFwiTm92XCIsIFwiRGVjXCIgXSxcclxuICAgICAgICByYW5nZUxhYmVsOiBkZWZhdWx0UmFuZ2VMYWJlbCxcclxuICAgICAgICB1bmRlZmluZWRMYWJlbDogXCJubyBkYXRhXCJcclxuICAgIH0sXHJcbiAgICAnZGUnOiB7XHJcbiAgICAgICAgZGVjaW1hbDogXCIsXCIsXHJcbiAgICAgICAgdGhvdXNhbmRzOiBcIi5cIixcclxuICAgICAgICBncm91cGluZzogWzNdLFxyXG4gICAgICAgIGN1cnJlbmN5OiBbXCLigqxcIiwgXCJcIl0sXHJcbiAgICAgICAgZGF0ZVRpbWU6IFwiJWEgJWIgJWUgJVggJVlcIixcclxuICAgICAgICBkYXRlOiBcIiVkLiVtLiVZXCIsXHJcbiAgICAgICAgdGltZTogXCIlSDolTTolU1wiLFxyXG4gICAgICAgIHBlcmlvZHM6IFtcIkFNXCIsIFwiUE1cIl0sXHJcbiAgICAgICAgZGF5czogW1wiU29ubnRhZ1wiLCBcIk1vbnRhZ1wiLCBcIkRpZW5zdGFnXCIsIFwiTWl0dHdvY2hcIiwgXCJEb25uZXJzdGFnXCIsIFwiRnJlaXRhZ1wiLCBcIlNhbXN0YWdcIl0sXHJcbiAgICAgICAgc2hvcnREYXlzOiBbXCJTb1wiLCBcIk1vXCIsIFwiRGlcIiwgXCJNaVwiLCBcIkRvXCIsIFwiRnJcIiwgXCJTYVwiXSxcclxuICAgICAgICBtb250aHM6IFtcIkrDpG5uZXJcIiwgXCJGZWJydWFyXCIsIFwiTcOkcnpcIiwgXCJBcHJpbFwiLCBcIk1haVwiLCBcIkp1bmlcIiwgXCJKdWxpXCIsIFwiQXVndXN0XCIsIFwiU2VwdGVtYmVyXCIsIFwiT2t0b2JlclwiLCBcIk5vdmVtYmVyXCIsIFwiRGV6ZW1iZXJcIl0sXHJcbiAgICAgICAgc2hvcnRNb250aHM6IFtcIkphbi5cIiwgXCJGZWIuXCIsIFwiTcOkcnpcIiwgXCJBcHIuXCIsIFwiTWFpXCIsIFwiSnVuaVwiLCBcIkp1bGlcIiwgXCJBdWcuXCIsIFwiU2VwLlwiLCBcIk9rdC5cIiwgXCJOb3YuXCIsIFwiRGV6LlwiXSxcclxuICAgICAgICByYW5nZUxhYmVsOiBmdW5jdGlvbihsb3dlciwgdXBwZXIsIGZvcm1hdCwgZXhjbHVkZUxvd2VyLCBleGNsdWRlVXBwZXIpIHtcclxuICAgICAgICAgICAgdmFyIGYgPSBmb3JtYXQgfHwgZnVuY3Rpb24obG93ZXIpe3JldHVybiBsb3dlcn07XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGlzTmFOKGxvd2VyKSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKGlzTmFOKHVwcGVyKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihcInJhbmdlTGFiZWw6IG5laXRoZXIgbG93ZXIgbm9yIHVwcGVyIHZhbHVlIHNwZWNpZmllZCFcIik7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiXCI7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gKGV4Y2x1ZGVVcHBlciA/IFwidW50ZXIgXCIgOiBcImJpcyBcIikgKyBmKHVwcGVyKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoaXNOYU4odXBwZXIpKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gKGV4Y2x1ZGVMb3dlciA/IFwibWVociBhbHMgXCIgKyBmKGxvd2VyKSA6IGYobG93ZXIpICsgXCIgdW5kIG1laHJcIik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIChleGNsdWRlTG93ZXIgPyAnPiAnIDogJycpICsgZihsb3dlcikgKyBcIiBiaXMgXCIgKyAoZXhjbHVkZVVwcGVyID8gJzwnIDogJycpICsgZih1cHBlcik7XHJcbiAgICAgICAgfSxcclxuICAgICAgICB1bmRlZmluZWRMYWJlbDogXCJrZWluZSBEYXRlblwiXHJcbiAgICB9XHJcbn07XHJcblxyXG5cclxubWFwbWFwLnByb3RvdHlwZS5zZXRMb2NhbGUgPSBmdW5jdGlvbihsYW5nKXtcclxuICAgIHZhciBsb2NhbGU7XHJcbiAgICBpZiAoZGQuaXNTdHJpbmcobGFuZykgJiYgZDNfbG9jYWxlc1tsYW5nXSkge1xyXG4gICAgICAgIGxvY2FsZSA9IGQzX2xvY2FsZXNbbGFuZ107XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgICBsb2NhbGUgPSBsYW5nO1xyXG4gICAgfVxyXG4gICAgdGhpcy5sb2NhbGUgPSBkMy5sb2NhbGUobG9jYWxlKTtcclxuICAgIFxyXG4gICAgLy8gRDMncyBsb2NhbGUgZG9lc24ndCBzdXBwb3J0IGV4dGVuZGVkIGF0dHJpYnV0ZXMsXHJcbiAgICAvLyBzbyBjb3B5IHRoZW0gb3ZlciBtYW51YWxseVxyXG4gICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhsb2NhbGUpO1xyXG4gICAgZm9yICh2YXIgaT0wOyBpPGtleXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICB2YXIga2V5ID0ga2V5c1tpXTtcclxuICAgICAgICBpZiAoIXRoaXMubG9jYWxlW2tleV0pIHtcclxuICAgICAgICAgICAgdGhpcy5sb2NhbGVba2V5XSA9IGxvY2FsZVtrZXldO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gdGhpcztcclxufVxyXG5cclxubWFwbWFwLnByb3RvdHlwZS5vcHRpb25zID0gZnVuY3Rpb24oc3BlYywgdmFsdWUpIHtcclxuXHJcbiAgICAvLyBsb2NhbGUgY2FuIGJlIHNldCB0aHJvdWdoIG9wdGlvbnMgYnV0IG5lZWRzIHRvIGJlIHNldCB1cCwgc28ga2VlcCB0cmFjayBvZiB0aGlzIGhlcmVcclxuICAgIHZhciBvbGRMb2NhbGUgPSB0aGlzLnNldHRpbmdzLmxvY2FsZTtcclxuXHJcbiAgICBtYXBtYXAuZXh0ZW5kKHRoaXMuc2V0dGluZ3MsIHNwZWMpO1xyXG4gICAgXHJcbiAgICBpZiAodGhpcy5zZXR0aW5ncy5sb2NhbGUgIT0gb2xkTG9jYWxlKSB7XHJcbiAgICAgICAgdGhpcy5zZXRMb2NhbGUodGhpcy5zZXR0aW5ncy5sb2NhbGUpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5sZWdlbmQgPSBmdW5jdGlvbihsZWdlbmRfZnVuYykge1xyXG4gICAgdGhpcy5sZWdlbmRfZnVuYyA9IGxlZ2VuZF9mdW5jO1xyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn1cclxubWFwbWFwLnByb3RvdHlwZS51cGRhdGVMZWdlbmQgPSBmdW5jdGlvbihhdHRyaWJ1dGUsIHJlcHJBdHRyaWJ1dGUsIG1ldGFkYXRhLCBzY2FsZSwgc2VsZWN0aW9uKSB7XHJcblxyXG4gICAgaWYgKCF0aGlzLmxlZ2VuZF9mdW5jIHx8ICFzY2FsZSkge1xyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAodHlwZW9mIG1ldGFkYXRhID09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgbWV0YWRhdGEgPSBtYXBtYXAuZ2V0TWV0YWRhdGEobWV0YWRhdGEpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB2YXIgcmFuZ2UgPSBzY2FsZS5yYW5nZSgpLFxyXG4gICAgICAgIGNsYXNzZXMsXHJcbiAgICAgICAgbWFwID0gdGhpczsgXHJcblxyXG4gICAgdmFyIGhpc3RvZ3JhbSA9IChmdW5jdGlvbigpIHtcclxuICAgICAgICB2YXIgZGF0YSA9IG51bGw7XHJcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKHZhbHVlKSB7XHJcbiAgICAgICAgICAgIC8vIGxhenkgaW5pdGlhbGl6YXRpb24gb2YgaGlzdG9ncmFtXHJcbiAgICAgICAgICAgIGlmIChkYXRhID09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIGRhdGEgPSB7fTtcclxuICAgICAgICAgICAgICAgIHZhciByZXBycyA9IG1hcC5nZXRSZXByZXNlbnRhdGlvbnMoc2VsZWN0aW9uKVswXTtcclxuICAgICAgICAgICAgICAgIHJlcHJzLmZvckVhY2goZnVuY3Rpb24ocmVwcikge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciB2YWwgPSByZXByLl9fZGF0YV9fLnByb3BlcnRpZXNbYXR0cmlidXRlXTtcclxuICAgICAgICAgICAgICAgICAgICAvLyBtYWtlIGEgc2VwYXJhdGUgYmluIGZvciBudWxsL3VuZGVmaW5lZCB2YWx1ZXNcclxuICAgICAgICAgICAgICAgICAgICAvLyB2YWx1ZXMgYXJlIGFsc28gaW52YWxpZCBpZiBudW1lcmljIHNjYWxlIGFuZCBub24tbnVtZXJpYyB2YWx1ZVxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWwgPT0gbnVsbCB8fCAobWV0YWRhdGEuc2NhbGUgIT0gJ29yZGluYWwnICYmIGlzTmFOKHZhbCkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBzY2FsZSh2YWwpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBpZiAoIWRhdGFbdmFsXSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhW3ZhbF0gPSBbcmVwcl07XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhW3ZhbF0ucHVzaChyZXByKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gZGF0YVt2YWx1ZV0gfHwgW107XHJcbiAgICAgICAgfVxyXG4gICAgfSkoKTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY291bnRlcihyKSB7XHJcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICByZXR1cm4gaGlzdG9ncmFtKHIpLmxlbmd0aDtcclxuICAgICAgICB9XHJcbiAgICB9ICAgXHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIG9iamVjdHMocikge1xyXG4gICAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGhpc3RvZ3JhbShyKTtcclxuICAgICAgICB9XHJcbiAgICB9ICAgXHJcbiAgICBcclxuICAgIC8vIHRoZSBtYWluIGRpc3RpbmN0aW9uIGlzOlxyXG4gICAgLy8gd2hldGhlciB3ZSBoYXZlIGFuIG91dHB1dCByYW5nZSBkaXZpZGVkIGludG8gY2xhc3Nlcywgb3IgYSBjb250aW51b3VzIHJhbmdlXHJcbiAgICAvLyBpbiB0aGUgZDMgQVBJLCBudW1lcmljIHNjYWxlcyB3aXRoIGEgZGlzY3JldGUgcmFuZ2UgaGF2ZSBhbiBpbnZlcnRFeHRlbnQgbWV0aG9kXHJcbiAgICBpZiAoc2NhbGUuaW52ZXJ0RXh0ZW50KSB7XHJcbiAgICAgICAgLy9jbGFzc2VzID0gW3NjYWxlLmludmVydEV4dGVudChyYW5nZVswXSlbMF1dO1xyXG4gICAgICAgIGNsYXNzZXMgPSByYW5nZS5tYXAoZnVuY3Rpb24ociwgaSkge1xyXG4gICAgICAgICAgICB2YXIgZXh0ZW50ID0gc2NhbGUuaW52ZXJ0RXh0ZW50KHIpO1xyXG4gICAgICAgICAgICAvLyBpZiB3ZSBoYXZlIHRvbyBtYW55IGl0ZW1zIGluIHJhbmdlLCBib3RoIGVudHJpZXMgaW4gZXh0ZW50IHdpbGwgYmUgdW5kZWZpbmVkIC0gaWdub3JlXHJcbiAgICAgICAgICAgIGlmIChleHRlbnRbMF0gPT0gbnVsbCAmJiBleHRlbnRbMV0gPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKFwicmFuZ2UgZm9yIFwiICsgbWV0YWRhdGEua2V5ICsgXCIgY29udGFpbnMgc3VwZXJmbHVvdXMgdmFsdWUgJ1wiICsgciArIFwiJyAtIGlnbm9yaW5nIVwiKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICByZXByZXNlbnRhdGlvbjogcixcclxuICAgICAgICAgICAgICAgIHZhbHVlUmFuZ2U6IGV4dGVudCxcclxuICAgICAgICAgICAgICAgIGluY2x1ZGVMb3dlcjogZmFsc2UsXHJcbiAgICAgICAgICAgICAgICBpbmNsdWRlVXBwZXI6IGk8cmFuZ2UubGVuZ3RoLTEsXHJcbiAgICAgICAgICAgICAgICAvLyBsYXp5IGFjY2Vzc29ycyAtIHByb2Nlc3NpbmcgaW50ZW5zaXZlXHJcbiAgICAgICAgICAgICAgICBjb3VudDogY291bnRlcihyKSxcclxuICAgICAgICAgICAgICAgIG9iamVjdHM6IG9iamVjdHMocilcclxuICAgICAgICAgICAgICAgIC8vVE9ETzogb3RoZXIgLyBtb3JlIGdlbmVyYWwgYWdncmVnYXRpb25zP1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pXHJcbiAgICAgICAgLmZpbHRlcihmdW5jdGlvbihkKXtyZXR1cm4gZDt9KTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICAgIC8vIG9yZGluYWwgYW5kIGNvbnRpbnVvdXMtcmFuZ2Ugc2NhbGVzXHJcbiAgICAgICAgY2xhc3NlcyA9IHJhbmdlLm1hcChmdW5jdGlvbihyLCBpKSB7XHJcbiAgICAgICAgICAgIHZhciB2YWx1ZSA9IHVuZGVmaW5lZDtcclxuICAgICAgICAgICAgaWYgKHNjYWxlLmludmVydCkge1xyXG4gICAgICAgICAgICAgICAgdmFsdWUgPSBzY2FsZS5pbnZlcnQocik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuKHtcclxuICAgICAgICAgICAgICAgIHJlcHJlc2VudGF0aW9uOiByLFxyXG4gICAgICAgICAgICAgICAgdmFsdWU6IHZhbHVlLFxyXG4gICAgICAgICAgICAgICAgLy8gbGF6eSBhY2Nlc3NvcnMgLSBwcm9jZXNzaW5nIGludGVuc2l2ZVxyXG4gICAgICAgICAgICAgICAgY291bnQ6IGNvdW50ZXIociksICBcclxuICAgICAgICAgICAgICAgIG9iamVjdHM6IG9iamVjdHMocilcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHZhciB1bmRlZmluZWRDbGFzcyA9IG51bGw7XHJcbiAgICAvLyBUT0RPOiBoYWNrIHRvIGdldCB1bmRlZmluZWQgY29sb3IgYm94XHJcbiAgICBpZiAocmVwckF0dHJpYnV0ZSA9PSAnZmlsbCcgJiYgbWV0YWRhdGEudW5kZWZpbmVkQ29sb3IgIT0gJ3RyYW5zcGFyZW50Jykge1xyXG4gICAgICAgIHVuZGVmaW5lZENsYXNzID0ge1xyXG4gICAgICAgICAgICByZXByZXNlbnRhdGlvbjogbWV0YWRhdGEudW5kZWZpbmVkQ29sb3IsXHJcbiAgICAgICAgICAgICdjbGFzcyc6ICd1bmRlZmluZWQnLFxyXG4gICAgICAgICAgICBjb3VudDogY291bnRlcihudWxsKSxcclxuICAgICAgICAgICAgb2JqZWN0czogb2JqZWN0cyhudWxsKVxyXG4gICAgICAgIH07XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRoaXMubGVnZW5kX2Z1bmMuY2FsbCh0aGlzLCBhdHRyaWJ1dGUsIHJlcHJBdHRyaWJ1dGUsIG1ldGFkYXRhLCBjbGFzc2VzLCB1bmRlZmluZWRDbGFzcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICByZXR1cm4gdGhpcztcclxuXHJcbn07XHJcblxyXG5mdW5jdGlvbiB2YWx1ZU9yQ2FsbChzcGVjKSB7XHJcbiAgICBpZiAodHlwZW9mIHNwZWMgPT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIHJldHVybiBzcGVjLmFwcGx5KHRoaXMsIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHNwZWM7XHJcbn1cclxuXHJcbi8vIG5hbWVzcGFjZSBmb3IgbGVnZW5kIGdlbmVyYXRpb24gZnVuY3Rpb25zXHJcbm1hcG1hcC5sZWdlbmQgPSB7fTtcclxuXHJcbm1hcG1hcC5sZWdlbmQuaHRtbCA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcclxuXHJcbiAgICB2YXIgREVGQVVMVFMgPSB7XHJcbiAgICAgICAgbGVnZW5kQ2xhc3NOYW1lOiAnbWFwTGVnZW5kJyxcclxuICAgICAgICBsZWdlbmRTdHlsZToge30sXHJcbiAgICAgICAgY2VsbFN0eWxlOiB7fSxcclxuICAgICAgICBjb2xvckJveFN0eWxlOiB7XHJcbiAgICAgICAgICAgIG92ZXJmbG93OiAnaGlkZGVuJyxcclxuICAgICAgICAgICAgZGlzcGxheTogJ2lubGluZS1ibG9jaycsXHJcbiAgICAgICAgICAgIHdpZHRoOiAnM2VtJyxcclxuICAgICAgICAgICAgaGVpZ2h0OiAnMS41ZW0nLFxyXG4gICAgICAgICAgICAndmVydGljYWwtYWxpZ24nOiAnLTAuNWVtJyxcclxuICAgICAgICAgICAgLy9ib3JkZXI6ICcxcHggc29saWQgIzQ0NDQ0NCcsXHJcbiAgICAgICAgICAgIG1hcmdpbjogJzAgMC41ZW0gMC4yZW0gMCdcclxuICAgICAgICB9LFxyXG4gICAgICAgIGNvbG9yRmlsbFN0eWxlOiB7XHJcbiAgICAgICAgICAgIHdpZHRoOiAnMCcsXHJcbiAgICAgICAgICAgIGhlaWdodDogJzAnLFxyXG4gICAgICAgICAgICAnYm9yZGVyLXdpZHRoJzogJzEwMHB4JyxcclxuICAgICAgICAgICAgJ2JvcmRlci1zdHlsZSc6ICdzb2xpZCcsXHJcbiAgICAgICAgICAgICdib3JkZXItY29sb3InOiAnI2ZmZmZmZidcclxuICAgICAgICB9LFxyXG4gICAgICAgIGxhYmVsU3R5bGU6IHt9LFxyXG4gICAgICAgIGhpc3RvZ3JhbUJhclN0eWxlOiB7XHJcbiAgICAgICAgICAgICdkaXNwbGF5JzogJ2lubGluZS1ibG9jaycsXHJcbiAgICAgICAgICAgIGhlaWdodDogJzEuMWVtJyxcclxuICAgICAgICAgICAgJ2ZvbnQtc2l6ZSc6ICcwLjhlbScsXHJcbiAgICAgICAgICAgICd2ZXJ0aWNhbC1hbGlnbic6ICcwLjFlbScsXHJcbiAgICAgICAgICAgIGNvbG9yOiAnIzk5OTk5OScsXHJcbiAgICAgICAgICAgICdiYWNrZ3JvdW5kLWNvbG9yJzogJyNkZGRkZGQnXHJcbiAgICAgICAgfSxcclxuICAgICAgICBoaXN0b2dyYW1CYXJXaWR0aDogMVxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgb3B0aW9ucyA9IG1hcG1hcC5leHRlbmQoREVGQVVMVFMsIG9wdGlvbnMpO1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBwYXJhbWV0ZXJGdW5jdGlvbihwYXJhbSwgZnVuYykge1xyXG4gICAgICAgIGlmIChkZC5pc0Z1bmN0aW9uKHBhcmFtKSkgcmV0dXJuIHBhcmFtO1xyXG4gICAgICAgIHJldHVybiBmdW5jKHBhcmFtKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgb3B0aW9ucy5oaXN0b2dyYW1CYXJXaWR0aCA9IHBhcmFtZXRlckZ1bmN0aW9uKG9wdGlvbnMuaGlzdG9ncmFtQmFyV2lkdGgsIGZ1bmN0aW9uKHBhcmFtKSB7XHJcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGNvdW50KSB7XHJcbiAgICAgICAgICAgIHZhciB3aWR0aCA9IGNvdW50ICogcGFyYW07XHJcbiAgICAgICAgICAgIC8vIGFsd2F5cyByb3VuZCB1cCBzbWFsbCB2YWx1ZXMgdG8gbWFrZSBzdXJlIGF0IGxlYXN0IDFweCB3aWRlXHJcbiAgICAgICAgICAgIGlmICh3aWR0aCA+IDAgJiYgd2lkdGggPCAxKSB3aWR0aCA9IDE7XHJcbiAgICAgICAgICAgIHJldHVybiB3aWR0aDtcclxuICAgICAgICB9O1xyXG4gICAgfSk7XHJcbiAgICBcclxuICAgIHJldHVybiBmdW5jdGlvbihhdHRyaWJ1dGUsIHJlcHJBdHRyaWJ1dGUsIG1ldGFkYXRhLCBjbGFzc2VzLCB1bmRlZmluZWRDbGFzcykge1xyXG4gICAgXHJcbiAgICAgICAgdmFyIGxlZ2VuZCA9IHRoaXMuX2VsZW1lbnRzLnBhcmVudC5zZWxlY3QoJy4nICsgb3B0aW9ucy5sZWdlbmRDbGFzc05hbWUpO1xyXG4gICAgICAgIGlmIChsZWdlbmQuZW1wdHkoKSkge1xyXG4gICAgICAgICAgICBsZWdlbmQgPSB0aGlzLl9lbGVtZW50cy5wYXJlbnQuYXBwZW5kKCdkaXYnKVxyXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJyxvcHRpb25zLmxlZ2VuZENsYXNzTmFtZSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGxlZ2VuZC5zdHlsZShvcHRpb25zLmxlZ2VuZFN0eWxlKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBUT0RPOiBhdHRyaWJ1dGUgbWF5IGJlIGEgZnVuY3Rpb24sIHNvIHdlIGNhbm5vdCBlYXNpbHkgZ2VuZXJhdGUgYSBsYWJlbCBmb3IgaXRcclxuICAgICAgICB2YXIgdGl0bGUgPSBsZWdlbmQuc2VsZWN0QWxsKCdoMycpXHJcbiAgICAgICAgICAgIC5kYXRhKFt2YWx1ZU9yQ2FsbChtZXRhZGF0YS5sYWJlbCwgYXR0cmlidXRlKSB8fCAoZGQuaXNTdHJpbmcoYXR0cmlidXRlKSA/IGF0dHJpYnV0ZSA6ICcnKV0pO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICB0aXRsZS5lbnRlcigpLmFwcGVuZCgnaDMnKTtcclxuICAgICAgICBcclxuICAgICAgICB0aXRsZS5odG1sKGZ1bmN0aW9uKGQpe3JldHVybiBkO30pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIHdlIG5lZWQgaGlnaGVzdCB2YWx1ZXMgZmlyc3QgZm9yIG51bWVyaWMgc2NhbGVzXHJcbiAgICAgICAgaWYgKG1ldGFkYXRhLnNjYWxlICE9ICdvcmRpbmFsJykge1xyXG4gICAgICAgICAgICBjbGFzc2VzLnJldmVyc2UoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHVuZGVmaW5lZENsYXNzKSB7XHJcbiAgICAgICAgICAgIGNsYXNzZXMucHVzaCh1bmRlZmluZWRDbGFzcyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjZWxscyA9IGxlZ2VuZC5zZWxlY3RBbGwoJ2Rpdi5sZWdlbmRDZWxsJylcclxuICAgICAgICAgICAgLmRhdGEoY2xhc3Nlcyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY2VsbHMuZXhpdCgpLnJlbW92ZSgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBuZXdjZWxscyA9IGNlbGxzLmVudGVyKClcclxuICAgICAgICAgICAgLmFwcGVuZCgnZGl2JylcclxuICAgICAgICAgICAgLnN0eWxlKG9wdGlvbnMuY2VsbFN0eWxlKTtcclxuICAgICAgICBcclxuICAgICAgICBjZWxsc1xyXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnbGVnZW5kQ2VsbCcpXHJcbiAgICAgICAgICAgIC5lYWNoKGZ1bmN0aW9uKGQpIHtcclxuICAgICAgICAgICAgICAgIGlmIChkLmNsYXNzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZDMuc2VsZWN0KHRoaXMpLmNsYXNzZWQoZC5jbGFzcywgdHJ1ZSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChyZXByQXR0cmlidXRlID09ICdmaWxsJykge1xyXG4gICAgICAgICAgICBpZiAoY2xhc3Nlc1swXS5yZXByZXNlbnRhdGlvbi5zdWJzdHJpbmcoMCw0KSAhPSAndXJsKCcpIHtcclxuICAgICAgICAgICAgICAgIG5ld2NlbGxzLmFwcGVuZCgnc3BhbicpXHJcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2xlZ2VuZENvbG9yJylcclxuICAgICAgICAgICAgICAgICAgICAuc3R5bGUob3B0aW9ucy5jb2xvckJveFN0eWxlKVxyXG4gICAgICAgICAgICAgICAgICAgIC5hcHBlbmQoJ3NwYW4nKVxyXG4gICAgICAgICAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdmaWxsJylcclxuICAgICAgICAgICAgICAgICAgICAuc3R5bGUob3B0aW9ucy5jb2xvckZpbGxTdHlsZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBjZWxscy5zZWxlY3QoJy5sZWdlbmRDb2xvciAuZmlsbCcpXHJcbiAgICAgICAgICAgICAgICAgICAgLnRyYW5zaXRpb24oKVxyXG4gICAgICAgICAgICAgICAgICAgIC5zdHlsZSh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdiYWNrZ3JvdW5kLWNvbG9yJzogZnVuY3Rpb24oZCkge3JldHVybiBkLnJlcHJlc2VudGF0aW9uO30sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdib3JkZXItY29sb3InOiBmdW5jdGlvbihkKSB7cmV0dXJuIGQucmVwcmVzZW50YXRpb247fSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ2NvbG9yJzogZnVuY3Rpb24oZCkge3JldHVybiBkLnJlcHJlc2VudGF0aW9uO31cclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIG5ld2NlbGxzLmFwcGVuZCgnc3ZnJylcclxuICAgICAgICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnbGVnZW5kQ29sb3InKVxyXG4gICAgICAgICAgICAgICAgICAgIC5zdHlsZShvcHRpb25zLmNvbG9yQm94U3R5bGUpXHJcbiAgICAgICAgICAgICAgICAgICAgLmFwcGVuZCgncmVjdCcpXHJcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB3aWR0aDogMTAwLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IDEwMFxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgY2VsbHMuc2VsZWN0KCcubGVnZW5kQ29sb3IgcmVjdCcpXHJcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnZmlsbCc6IGZ1bmN0aW9uKGQpIHtyZXR1cm4gZC5yZXByZXNlbnRhdGlvbjt9XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSBpZiAocmVwckF0dHJpYnV0ZSA9PSAnc3Ryb2tlQ29sb3InKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIG5ld2NlbGxzLmFwcGVuZCgnc3BhbicpXHJcbiAgICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnbGVnZW5kQ29sb3InKVxyXG4gICAgICAgICAgICAgICAgLnN0eWxlKG9wdGlvbnMuY29sb3JCb3hTdHlsZSlcclxuICAgICAgICAgICAgICAgIC5zdHlsZSgnYm9yZGVyJywgJ25vbmUnKVxyXG4gICAgICAgICAgICAgICAgLmFwcGVuZCgnc3BhbicpXHJcbiAgICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnZmlsbCcpXHJcbiAgICAgICAgICAgICAgICAuc3R5bGUob3B0aW9ucy5jb2xvckZpbGxTdHlsZSk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgY2VsbHMuc2VsZWN0KCcubGVnZW5kQ29sb3IgLmZpbGwnKVxyXG4gICAgICAgICAgICAgICAgLnRyYW5zaXRpb24oKVxyXG4gICAgICAgICAgICAgICAgLnN0eWxlKHtcclxuICAgICAgICAgICAgICAgICAgICAnYmFja2dyb3VuZC1jb2xvcic6IGZ1bmN0aW9uKGQpIHtyZXR1cm4gZC5yZXByZXNlbnRhdGlvbjt9LFxyXG4gICAgICAgICAgICAgICAgICAgICdib3JkZXItY29sb3InOiBmdW5jdGlvbihkKSB7cmV0dXJuIGQucmVwcmVzZW50YXRpb247fSxcclxuICAgICAgICAgICAgICAgICAgICAnY29sb3InOiBmdW5jdGlvbihkKSB7cmV0dXJuIGQucmVwcmVzZW50YXRpb247fVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIG5ld2NlbGxzLmFwcGVuZCgnc3BhbicpXHJcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsJ2xlZ2VuZExhYmVsJylcclxuICAgICAgICAgICAgLnN0eWxlKG9wdGlvbnMubGFiZWxTdHlsZSk7XHJcblxyXG4gICAgICAgIGNlbGxzLmF0dHIoJ2RhdGEtY291bnQnLGZ1bmN0aW9uKGQpIHtyZXR1cm4gZC5jb3VudCgpO30pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNlbGxzLnNlbGVjdCgnLmxlZ2VuZExhYmVsJylcclxuICAgICAgICAgICAgLnRleHQoZnVuY3Rpb24oZCkge1xyXG4gICAgICAgICAgICAgICAgdmFyIGZvcm1hdHRlcjtcclxuICAgICAgICAgICAgICAgIC8vIFRPRE86IHdlIG5lZWQgc29tZSB3YXkgb2YgZmluZGluZyBvdXQgd2hldGhlciB3ZSBoYXZlIGludGVydmFscyBvciB2YWx1ZXMgZnJvbSB0aGUgbWV0YWRhdGFcclxuICAgICAgICAgICAgICAgIC8vIHRvIGNhY2hlIHRoZSBsYWJlbCBmb3JtYXR0ZXJcclxuICAgICAgICAgICAgICAgIGlmIChkLnZhbHVlUmFuZ2UpIHtcclxuICAgICAgICAgICAgICAgICAgICBmb3JtYXR0ZXIgPSBtZXRhZGF0YS5nZXRSYW5nZUZvcm1hdHRlcigpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmb3JtYXR0ZXIoZC52YWx1ZVJhbmdlWzBdLCBkLnZhbHVlUmFuZ2VbMV0sIGQuaW5jbHVkZUxvd2VyLCBkLmluY2x1ZGVVcHBlcik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpZiAoZC52YWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGZvcm1hdHRlciA9IG1ldGFkYXRhLmdldEZvcm1hdHRlcigpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmb3JtYXR0ZXIoZC52YWx1ZSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbWV0YWRhdGEudW5kZWZpbmVkTGFiZWw7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICBpZiAob3B0aW9ucy5oaXN0b2dyYW0pIHtcclxuXHJcbiAgICAgICAgICAgIG5ld2NlbGxzLmFwcGVuZCgnc3BhbicpXHJcbiAgICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnbGVnZW5kSGlzdG9ncmFtQmFyJylcclxuICAgICAgICAgICAgICAgIC5zdHlsZShvcHRpb25zLmhpc3RvZ3JhbUJhclN0eWxlKTtcclxuXHJcbiAgICAgICAgICAgIGNlbGxzLnNlbGVjdCgnLmxlZ2VuZEhpc3RvZ3JhbUJhcicpLnRyYW5zaXRpb24oKVxyXG4gICAgICAgICAgICAgICAgLnN0eWxlKCd3aWR0aCcsIGZ1bmN0aW9uKGQpe1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciB3aWR0aCA9IG9wdGlvbnMuaGlzdG9ncmFtQmFyV2lkdGgoZC5jb3VudCgpKTtcclxuICAgICAgICAgICAgICAgICAgICAvLyBzdHJpbmcgcmV0dXJuZWQ/IC0+IHVzZSB1bmNoYW5nZWRcclxuICAgICAgICAgICAgICAgICAgICBpZiAod2lkdGgubGVuZ3RoICYmIHdpZHRoLmluZGV4T2YoJ3B4JykgPT0gd2lkdGgubGVuZ2h0IC0gMikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gd2lkdGg7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBNYXRoLnJvdW5kKHdpZHRoKSArICdweCc7XHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgICAgLnRleHQoZnVuY3Rpb24oZCkgeyByZXR1cm4gJyAnICsgZC5jb3VudCgpOyB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKG9wdGlvbnMuY2FsbGJhY2spIG9wdGlvbnMuY2FsbGJhY2soKTtcclxuICAgIH1cclxufVxyXG5cclxubWFwbWFwLmxlZ2VuZC5zdmcgPSBmdW5jdGlvbihyYW5nZSwgbGFiZWxGb3JtYXQsIGhpc3RvZ3JhbSwgb3B0aW9ucykge1xyXG5cclxuICAgIHZhciBERUZBVUxUUyA9IHtcclxuICAgICAgICBjZWxsU3BhY2luZzogNSxcclxuICAgICAgICBsYXlvdXQ6ICd2ZXJ0aWNhbCcsXHJcbiAgICAgICAgaGlzdG9ncmFtOiBmYWxzZSxcclxuICAgICAgICBoaXN0b2dyYW1MZW5ndGg6IDgwLFxyXG4gICAgICAgIGNvbnRhaW5lckF0dHJpYnV0ZXM6IHtcclxuICAgICAgICAgICAgdHJhbnNmb3JtOiAndHJhbnNsYXRlKDIwLDEwKSdcclxuICAgICAgICB9LFxyXG4gICAgICAgIGJhY2tncm91bmRBdHRyaWJ1dGVzOiB7XHJcbiAgICAgICAgICAgIGZpbGw6ICcjZmZmJyxcclxuICAgICAgICAgICAgJ2ZpbGwtb3BhY2l0eSc6IDAuOSxcclxuICAgICAgICAgICAgeDogLTEwLFxyXG4gICAgICAgICAgICB5OiAtMTAsXHJcbiAgICAgICAgICAgIHdpZHRoOiAyMjBcclxuICAgICAgICB9LFxyXG4gICAgICAgIGNlbGxBdHRyaWJ1dGVzOiB7XHJcbiAgICAgICAgfSxcclxuICAgICAgICBjb2xvckF0dHJpYnV0ZXM6IHtcclxuICAgICAgICAgICAgJ3dpZHRoJzogNDAsXHJcbiAgICAgICAgICAgICdoZWlnaHQnOiAxOCxcclxuICAgICAgICAgICAgJ3N0cm9rZSc6ICcjMDAwJyxcclxuICAgICAgICAgICAgJ3N0cm9rZS13aWR0aCc6ICcwLjVweCcsXHJcbiAgICAgICAgICAgICdmaWxsJzogJyNmZmYnICAvLyB0aGlzIHdpbGwgYmUgdXNlZCBiZWZvcmUgZmlyc3QgdHJhbnNpdGlvblxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgdGV4dEF0dHJpYnV0ZXM6IHtcclxuICAgICAgICAgICAgJ2ZvbnQtc2l6ZSc6IDEwLFxyXG4gICAgICAgICAgICAncG9pbnRlci1ldmVudHMnOiAnbm9uZScsXHJcbiAgICAgICAgICAgIGR5OiAxMlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgaGlzdG9ncmFtQmFyQXR0cmlidXRlczoge1xyXG4gICAgICAgICAgICB3aWR0aDogMCxcclxuICAgICAgICAgICAgeDogMTQwLFxyXG4gICAgICAgICAgICB5OiA0LFxyXG4gICAgICAgICAgICBoZWlnaHQ6IDEwLFxyXG4gICAgICAgICAgICBmaWxsOiAnIzAwMCcsXHJcbiAgICAgICAgICAgICdmaWxsLW9wYWNpdHknOiAwLjJcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIC8vIFRPRE86IHdlIGNhbid0IGludGVncmF0ZSB0aGVzIGludG8gc2V0dGluZ3MgYmVjYXVzZSBpdCByZWZlcmVuY2VzIHNldHRpbmdzIGF0dHJpYnV0ZXNcclxuICAgIHZhciBsYXlvdXRzID0ge1xyXG4gICAgICAgICdob3Jpem9udGFsJzoge1xyXG4gICAgICAgICAgICBjZWxsQXR0cmlidXRlczoge1xyXG4gICAgICAgICAgICAgICAgdHJhbnNmb3JtOiBmdW5jdGlvbihkLGkpeyByZXR1cm4gJ3RyYW5zbGF0ZSgnICsgaSAqIChvcHRpb25zLmNvbG9yQXR0cmlidXRlcy53aWR0aCArIG9wdGlvbnMuY2VsbFNwYWNpbmcpICsgJywwKSc7fVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB0ZXh0QXR0cmlidXRlczoge1xyXG4gICAgICAgICAgICAgICAgeTogZnVuY3Rpb24oKSB7IHJldHVybiBvcHRpb25zLmNvbG9yQXR0cmlidXRlcy5oZWlnaHQgKyBvcHRpb25zLmNlbGxTcGFjaW5nO31cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSxcclxuICAgICAgICAndmVydGljYWwnOiB7XHJcbiAgICAgICAgICAgIGNlbGxBdHRyaWJ1dGVzOiB7XHJcbiAgICAgICAgICAgICAgICB0cmFuc2Zvcm06IGZ1bmN0aW9uKGQsaSl7IHJldHVybiAndHJhbnNsYXRlKDAsJyArIGkgKiAob3B0aW9ucy5jb2xvckF0dHJpYnV0ZXMuaGVpZ2h0ICsgb3B0aW9ucy5jZWxsU3BhY2luZykgKyAnKSc7fVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB0ZXh0QXR0cmlidXRlczoge1xyXG4gICAgICAgICAgICAgICAgeDogZnVuY3Rpb24oKSB7IHJldHVybiBvcHRpb25zLmNvbG9yQXR0cmlidXRlcy53aWR0aCArIG9wdGlvbnMuY2VsbFNwYWNpbmc7fSxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgdmFyIGxheW91dCA9IGxheW91dHNbb3B0aW9ucy5sYXlvdXRdO1xyXG4gICAgXHJcbiAgICBpZiAob3B0aW9ucy5sYXlvdXQgPT0gJ3ZlcnRpY2FsJykge1xyXG4gICAgICAgIHJhbmdlLnJldmVyc2UoKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhpcy5fZWxlbWVudHMubGVnZW5kLmF0dHIob3B0aW9ucy5jb250YWluZXJBdHRyaWJ1dGVzKTtcclxuIFxyXG4gICAgdmFyIGJnID0gdGhpcy5fZWxlbWVudHMubGVnZW5kLnNlbGVjdEFsbCgncmVjdC5iYWNrZ3JvdW5kJylcclxuICAgICAgICAuZGF0YShbMV0pO1xyXG4gICAgXHJcbiAgICBiZy5lbnRlcigpXHJcbiAgICAgICAgLmFwcGVuZCgncmVjdCcpXHJcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2JhY2tncm91bmQnKVxyXG4gICAgICAgIC5hdHRyKG9wdGlvbnMuYmFja2dyb3VuZEF0dHJpYnV0ZXMpO1xyXG4gICAgYmcudHJhbnNpdGlvbigpLmF0dHIoJ2hlaWdodCcsIGhpc3RvZ3JhbS5sZW5ndGggKiAob3B0aW9ucy5jb2xvckF0dHJpYnV0ZXMuaGVpZ2h0ICsgb3B0aW9ucy5jZWxsU3BhY2luZykgKyAoMjAgLSBvcHRpb25zLmNlbGxTcGFjaW5nKSk7ICAgIFxyXG4gICAgICAgIFxyXG4gICAgdmFyIGNlbGxzID0gdGhpcy5fZWxlbWVudHMubGVnZW5kLnNlbGVjdEFsbCgnZy5jZWxsJylcclxuICAgICAgICAuZGF0YShyYW5nZSk7XHJcbiAgICBcclxuICAgIGNlbGxzLmV4aXQoKS5yZW1vdmUoKTtcclxuICAgIFxyXG4gICAgdmFyIG5ld2NlbGxzID0gY2VsbHMuZW50ZXIoKVxyXG4gICAgICAgIC5hcHBlbmQoJ2cnKVxyXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdjZWxsJylcclxuICAgICAgICAuYXR0cihvcHRpb25zLmNlbGxBdHRyaWJ1dGVzKVxyXG4gICAgICAgIC5hdHRyKGxheW91dC5jZWxsQXR0cmlidXRlcyk7XHJcbiAgICAgICAgXHJcbiAgICBuZXdjZWxscy5hcHBlbmQoJ3JlY3QnKVxyXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdjb2xvcicpXHJcbiAgICAgICAgLmF0dHIob3B0aW9ucy5jb2xvckF0dHJpYnV0ZXMpXHJcbiAgICAgICAgLmF0dHIobGF5b3V0LmNvbG9yQXR0cmlidXRlcyk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgIGlmIChvcHRpb25zLmhpc3RvZ3JhbSkge1xyXG5cclxuICAgICAgICBuZXdjZWxscy5hcHBlbmQoJ3JlY3QnKVxyXG4gICAgICAgICAgICAuYXR0cihcImNsYXNzXCIsIFwiYmFyXCIpXHJcbiAgICAgICAgICAgIC5hdHRyKG9wdGlvbnMuaGlzdG9ncmFtQmFyQXR0cmlidXRlcyk7XHJcblxyXG4gICAgICAgIGNlbGxzLnNlbGVjdCgnLmJhcicpLnRyYW5zaXRpb24oKVxyXG4gICAgICAgICAgICAuYXR0cihcIndpZHRoXCIsIGZ1bmN0aW9uKGQsaSl7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gaGlzdG9ncmFtW2hpc3RvZ3JhbS5sZW5ndGgtaS0xXS55ICogb3B0aW9ucy5oaXN0b2dyYW1MZW5ndGg7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIG5ld2NlbGxzLmFwcGVuZCgndGV4dCcpXHJcbiAgICAgICAgLmF0dHIob3B0aW9ucy50ZXh0QXR0cmlidXRlcylcclxuICAgICAgICAuYXR0cihsYXlvdXQudGV4dEF0dHJpYnV0ZXMpO1xyXG4gICAgXHJcbiAgICBjZWxscy5zZWxlY3QoJy5jb2xvcicpLnRyYW5zaXRpb24oKVxyXG4gICAgICAgIC5hdHRyKCdmaWxsJywgZnVuY3Rpb24oZCkge3JldHVybiBkO30pO1xyXG4gICAgXHJcbiAgICBjZWxscy5zZWxlY3QoJ3RleHQnKVxyXG4gICAgICAgIC50ZXh0KGxhYmVsRm9ybWF0KTtcclxufVxyXG5cclxubWFwbWFwLnByb3RvdHlwZS5wcm9qZWN0aW9uID0gZnVuY3Rpb24ocHJvamVjdGlvbikge1xyXG4gICAgaWYgKHByb2plY3Rpb24gPT09IHVuZGVmaW5lZCkgcmV0dXJuIHRoaXMuX3Byb2plY3Rpb247XHJcbiAgICB0aGlzLl9wcm9qZWN0aW9uID0gcHJvamVjdGlvbjtcclxuICAgIHJldHVybiB0aGlzO1xyXG59XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLmV4dGVudCA9IGZ1bmN0aW9uKHNlbGVjdGlvbiwgb3B0aW9ucykge1xyXG5cclxuICAgIHZhciBtYXAgPSB0aGlzO1xyXG4gICAgXHJcbiAgICB0aGlzLnNlbGVjdGVkX2V4dGVudCA9IHNlbGVjdGlvbiB8fCB0aGlzLnNlbGVjdGVkO1xyXG4gICAgXHJcbiAgICB0aGlzLl9wcm9taXNlLmdlb21ldHJ5LnRoZW4oZnVuY3Rpb24odG9wbykge1xyXG4gICAgICAgIC8vIFRPRE86IGdldFJlcHJlc2VudGF0aW9ucygpIGRlcGVuZHMgb24gPHBhdGg+cyBiZWluZyBkcmF3biwgYnV0IHdlIHdhbnQgdG8gXHJcbiAgICAgICAgLy8gYmUgYWJsZSB0byBjYWxsIGV4dGVudCgpIGJlZm9yZSBkcmF3KCkgdG8gc2V0IHVwIHByb2plY3Rpb25cclxuICAgICAgICAvLyBzb2x1dGlvbjogbWFuYWdlIG1lcmdlZCBnZW9tZXRyeSArIGRhdGEgaW5kZXBlbmRlbnQgZnJvbSBTVkcgcmVwcmVzZW50YXRpb25cclxuICAgICAgICB2YXIgZ2VvbSA9IG1hcC5nZXRSZXByZXNlbnRhdGlvbnMobWFwLnNlbGVjdGVkX2V4dGVudCk7XHJcbiAgICAgICAgdmFyIGFsbCA9IHtcclxuICAgICAgICAgICAgJ3R5cGUnOiAnRmVhdHVyZUNvbGxlY3Rpb24nLFxyXG4gICAgICAgICAgICAnZmVhdHVyZXMnOiBbXVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgZ2VvbS5lYWNoKGZ1bmN0aW9uKGQpe1xyXG4gICAgICAgICAgICBhbGwuZmVhdHVyZXMucHVzaChkKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgbWFwLl9leHRlbnQoYWxsLCBvcHRpb25zKTtcclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLl9leHRlbnQgPSBmdW5jdGlvbihnZW9tLCBvcHRpb25zKSB7XHJcblxyXG4gICAgb3B0aW9ucyA9IGRkLm1lcmdlKHtcclxuICAgICAgICBmaWxsRmFjdG9yOiAwLjlcclxuICAgIH0sIG9wdGlvbnMpO1xyXG4gICAgXHJcbiAgICAvLyBjb252ZXJ0L21lcmdlIHRvcG9KU09OXHJcbiAgICBpZiAoZ2VvbS50eXBlICYmIGdlb20udHlwZSA9PSAnVG9wb2xvZ3knKSB7XHJcbiAgICAgICAgLy8gd2UgbmVlZCB0byBtZXJnZSBhbGwgbmFtZWQgZmVhdHVyZXNcclxuICAgICAgICB2YXIgbmFtZXMgPSBPYmplY3Qua2V5cyhnZW9tLm9iamVjdHMpO1xyXG4gICAgICAgIHZhciBhbGwgPSBbXTtcclxuICAgICAgICBmb3IgKHZhciBpPTA7IGk8bmFtZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgYWxsID0gYWxsLmNvbmNhdCh0b3BvanNvbi5mZWF0dXJlKGdlb20sIGdlb20ub2JqZWN0c1tuYW1lc1tpXV0pLmZlYXR1cmVzKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZ2VvbSA9IGFsbDtcclxuICAgIH1cclxuICAgIGlmIChkZC5pc0FycmF5KGdlb20pKSB7XHJcbiAgICAgICAgdmFyIGFsbCA9IHtcclxuICAgICAgICAgICAgJ3R5cGUnOiAnRmVhdHVyZUNvbGxlY3Rpb24nLFxyXG4gICAgICAgICAgICAnZmVhdHVyZXMnOiBnZW9tXHJcbiAgICAgICAgfTtcclxuICAgICAgICBnZW9tID0gYWxsO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyByZXNldCBzY2FsZSB0byBiZSBhYmxlIHRvIGNhbGN1bGF0ZSBleHRlbnRzIG9mIGdlb21ldHJ5XHJcbiAgICB0aGlzLl9wcm9qZWN0aW9uLnNjYWxlKDEpLnRyYW5zbGF0ZShbMCwgMF0pO1xyXG4gICAgdmFyIHBhdGhHZW5lcmF0b3IgPSBkMy5nZW8ucGF0aCgpLnByb2plY3Rpb24odGhpcy5fcHJvamVjdGlvbik7XHJcbiAgICB2YXIgYm91bmRzID0gcGF0aEdlbmVyYXRvci5ib3VuZHMoZ2VvbSk7XHJcbiAgICAvLyB1c2UgYWJzb2x1dGUgdmFsdWVzLCBhcyBlYXN0IGRvZXMgbm90IGFsd2F5cyBoYXZlIHRvIGJlIHJpZ2h0IG9mIHdlc3QhXHJcbiAgICBib3VuZHMuaGVpZ2h0ID0gTWF0aC5hYnMoYm91bmRzWzFdWzFdIC0gYm91bmRzWzBdWzFdKTtcclxuICAgIGJvdW5kcy53aWR0aCA9IE1hdGguYWJzKGJvdW5kc1sxXVswXSAtIGJvdW5kc1swXVswXSk7XHJcbiAgICBcclxuICAgIC8vIGlmIHdlIGFyZSBub3QgY2VudGVyZWQgaW4gbWlkcG9pbnQsIGNhbGN1bGF0ZSBcInBhZGRpbmcgZmFjdG9yXCJcclxuICAgIHZhciBmYWNfeCA9IDEgLSBNYXRoLmFicygwLjUgLSBjZW50ZXIueCkgKiAyLFxyXG4gICAgICAgIGZhY195ID0gMSAtIE1hdGguYWJzKDAuNSAtIGNlbnRlci55KSAqIDI7XHJcbiAgICAgICAgXHJcbiAgICB2YXIgc2l6ZSA9IHRoaXMuc2l6ZSgpO1xyXG4gICAgdmFyIHNjYWxlID0gb3B0aW9ucy5maWxsRmFjdG9yIC8gTWF0aC5tYXgoYm91bmRzLndpZHRoIC8gc2l6ZS53aWR0aCAvIGZhY194LCBib3VuZHMuaGVpZ2h0IC8gc2l6ZS5oZWlnaHQgLyBmYWNfeSk7XHJcbiAgICBcclxuICAgIHRoaXMuX3Byb2plY3Rpb25cclxuICAgICAgICAuc2NhbGUoc2NhbGUpXHJcbiAgICAgICAgLnRyYW5zbGF0ZShbKHNpemUud2lkdGggLSBzY2FsZSAqIChib3VuZHNbMV1bMF0gKyBib3VuZHNbMF1bMF0pKS8gMiwgKHNpemUuaGVpZ2h0IC0gc2NhbGUgKiAoYm91bmRzWzFdWzFdICsgYm91bmRzWzBdWzFdKSkvIDJdKTsgIFxyXG4gICAgXHJcbiAgICAvLyBhcHBseSBuZXcgcHJvamVjdGlvbiB0byBleGlzdGluZyBwYXRoc1xyXG4gICAgdGhpcy5fZWxlbWVudHMubWFwLnNlbGVjdEFsbChcInBhdGhcIilcclxuICAgICAgICAuYXR0cihcImRcIiwgcGF0aEdlbmVyYXRvcik7ICAgICAgICBcclxuICAgIFxyXG59O1xyXG5cclxuZnVuY3Rpb24ga2V5T3JDYWxsYmFjayh2YWwpIHtcclxuICAgIGlmICh0eXBlb2YgdmFsICE9ICdmdW5jdGlvbicpIHtcclxuICAgICAgICByZXR1cm4gZnVuY3Rpb24oZCl7XHJcbiAgICAgICAgICAgIHJldHVybiBkW3ZhbF07XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuICAgIHJldHVybiB2YWw7XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gbWFwbWFwOyJdfQ==

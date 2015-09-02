(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.mapmap = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
/*! mapmap.js 0.2.6 © 2014-2015 Florian Ledermann 

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

var version = '0.2.6';

// TODO: can we get rid of jQuery dependency through var extend = require("jquery-extend")?
function _assert(test, message) { if (test) return; throw new Error("[mapmap] " + message);}
_assert(d3, "d3.js is required!");
_assert($, "jQuery is required!");

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
        undefinedValue: "" //"undefined"
    }
};

var mapmap = function(element, options) {
    // ensure constructor invocation
    if (!(this instanceof mapmap)) return new mapmap(element, options);

    this.settings = {};    
    this.options(mapmap.extend(true, {}, default_settings, options));
    
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
// this is a hack as browserify doesn't support mutliple global exports
mapmap.datadata = dd;

mapmap.prototype = {
	version: version
};

mapmap.extend = $.extend;
/*
// TODO: this or jquery-extend to get rid of jquery dep.?
// http://andrewdupont.net/2009/08/28/deep-extending-objects-in-javascript/
mapmap.extend = function(destination, source) {
  for (var property in source) {
    if (source[property] && source[property].constructor && source[property].constructor === Object) {
      destination[property] = destination[property] || {};
      mapmap.extend(destination[property], source[property]);
    }
    else {
      destination[property] = source[property];
    }
  }
  return destination;
};
*/

mapmap.prototype.initEngine = function(element) {
    // SVG specific initialization, for now we have no engine switching functionality
    
    // HTML elements, stored as d3 selections    
    var mainEl = d3.select(element).classed('mapmap', true),
        mapEl = mainEl.append('g').attr('class', 'map');
    
    mainEl.attr(this.settings.svgAttributes);
    
    this._elements = {
        main: mainEl,
        map: mapEl,
        parent: $(mainEl.node()).parent(),
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
    
    // any IE?
    if (navigator.userAgent.indexOf('MSIE') !== -1 || navigator.appVersion.indexOf('Trident/') > 0) {
        this.supports.hoverDomModification = false;
    }
    else {
        this.supports.hoverDomModification = true;
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

mapmap.prototype.geometry = function(spec, keyOrOptions) {

    // key is default option
    var options = dd.isString(keyOrOptions) ? {key: keyOrOptions} : keyOrOptions;

    options = dd.merge({
        key: 'id',
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
            map.draw();
            if (options.ondraw) options.ondraw();
        });
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
        if (!map.selected_extent) {
            map._extent(new_topo.values());           
        }
        // TODO: we need a smarter way of setting up projection/bounding box initially
        // if extent() was called, this should have set up bounds, else we need to do it here
        // however, extent() currently operates on the rendered <path>s generated by draw()
        //this._promise.geometry.then(draw);
        map.draw();
        if (options.ondraw) options.ondraw();
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
        if (!map.selected_extent) {
            map._extent(geom);           
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
    // TODO:
    // our viewBox is set up for an extent of 800x400 units
    // should we change this?

    // bounds are re-calculate by initEvents on every resize
    return {
        width: this.width,
        height: this.height
    };
};


mapmap.prototype.getBoundingClientRect = function() {
    // basically returns getBoundingClientRect() for main SVG element
    // Firefox < 35 will report wrong BoundingClientRect (adding clipped background),
    // so we have to fix it
    // https://bugzilla.mozilla.org/show_bug.cgi?id=530985
    // http://stackoverflow.com/questions/23684821/calculate-size-of-svg-element-in-html-page
    var el = this._elements.main.node(),
        bounds = el.getBoundingClientRect(),
        cs = getComputedStyle(el),
        parentOffset = $(el.parentNode).offset(),
        left = parentOffset.left;
    // TODO: take into account margins etc.
    if (cs.left.indexOf('px') > -1) {
        left += parseInt(cs.left.slice(0,-2));
    }
    // this tests getBoundingClientRect() to be non-buggy
    if (bounds.left == left) {
        return bounds;
    }
    // construct synthetic boundingbox from computed style
    var top = parentOffset.top,
        width = parseInt(cs.width.slice(0,-2)),
        height = parseInt(cs.height.slice(0,-2));
    return {
        left: left,
        top: top,
        width: width,
        height: height,
        right: left + width,
        bottom: top + height
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
            map._elements.geometry.selectAll('path')
                .each(function(d) {
                    if (d.properties) {
                        var k = d.properties[options.geometryKey];
                        if (k) {
                            mapmap.extend(d.properties, data.get(k));
                        }
                        else {
                            //console.warn("No '" + geometryKey + "' value present for " + this + "!");
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
    this.format = function(val) {
        if (!this._format) {
            this._format = this.getFormatter();
        }
        if ((this.numberFormat && (isNaN(val) || val === undefined || val === null)) || (!this.numberFormat && !val)) {
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
            if (!isNaN(+val)) {
                stats.countNumbers += 1;
                if (stats.min === undefined) stats.min = val;
                if (stats.max === undefined) stats.max = val;
                if (val < stats.min) stats.min = val;
                if (val > stats.max) stats.max = val;
                if (val > 0) stats.anyPositive = true;
                if (val < 0) stats.anyNegative = true;
            }
            if (isNaN(+val) && val) stats.anyString = true;
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

mapmap.prototype.autoColorScale = function(value, metadata) {
    
    if (!metadata) {
        metadata = this.getMetadata(value);
    }
    else {
        metadata = dd.merge(this.settings.defaultMetadata, metadata);
    }
    
    if (!metadata.domain) {
        var stats = getStats(this._elements.geometry.selectAll('path'), properties_accessor(keyOrCallback(value)));
        
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

mapmap.prototype.symbolize = function(callback, selection, finalize) {

    var map = this;
    
    // store in closure for later access
    selection = selection || this.selected;
    this.promise_data().then(function(data) {      
        map.getRepresentations(selection)
            .each(function(geom) {
                callback.call(map, d3.select(this), geom);
            });
        if (finalize) finalize.call(map);
    });
    return this;
};

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
            colorScale = this.autoColorScale(spec, metadata);
            this.updateLegend(spec, metadata, colorScale, selection);
        }
        if (el.attr('fill') != 'none') {
            // transition if color already set
            el = el.transition();
        }
        el.attr('fill', function(geom) {           
            var val = valueFunc(geom.properties);
            // explicitly check if value is valid - this can be a problem with ordinal scales
            if (typeof(val) == 'undefined') {
                val = metadata.undefinedValue; 
            }
            return colorScale(val) || map.settings.pathAttributes.fill;
        });
    }
    
    this.symbolize(color, selection, function(){
        this.dispatcher.choropleth.call(this, spec);
    });
        
    return this;
};

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
            colorScale = this.autoColorScale(spec, metadata);
            this.updateLegend(spec, metadata, colorScale, selection);
        }
        if (el.attr('stroke') != 'none') {
            // transition if color already set
            el = el.transition();
        }
        el.attr('stroke', function(geom) {           
            var val = valueFunc(geom.properties);
            // explicitly check if value is valid - this can be a problem with ordinal scales
            if (typeof(val) == 'undefined') {
                val = metadata.undefinedValue; 
            }
            return colorScale(val) || map.settings.pathAttributes.stroke;
        });
    }
    
    this.symbolize(color, selection);
        
    return this;
};

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

    return {
        x: event.offsetX + options.anchorOffset[0],
        y: event.offsetY + options.anchorOffset[1]
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
            
            var anchor = options.anchorPosition.call(map, d3.event, this, options);
            
            overCB.call(map, d.properties, anchor, this);           
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
                    html += pre + prefix + val + post;
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
    
    var hoverEl = this._elements.parent.find('.' + options.hoverClassName);

    if (!spec) {
        return this.hover(null, null, options);
    }

    var htmlFunc = this.buildHTMLFunc(spec);
    if (hoverEl.length == 0) {
        hoverEl = $('<div class="' + options.hoverClassName + '"></div>');
        this._elements.parent.append(hoverEl);
    }
    hoverEl.css(options.hoverStyle);
    if (!hoverEl.mapmap_eventHandlerInstalled) {
        hoverEl.on('mouseenter', function() {
            hoverEl.css(options.hoverEnterStyle);
        }).on('mouseleave', function() {
            hoverEl.css(options.hoverLeaveStyle);
        });
        hoverEl.mapmap_eventHandlerInstalled = true;
    }
    
    function show(d, point){
        // offsetParent only works for rendered objects, so place object first!
        // https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement.offsetParent
        hoverEl.css(options.hoverEnterStyle);  
        
        var offsetEl = hoverEl.offsetParent(),
            offsetHeight = offsetEl.outerHeight(false),
            mainEl = this._elements.main.node(),
            scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0,
            top = mainEl.getBoundingClientRect().top + scrollTop - offsetEl.offset().top;
                    
        hoverEl
            .css({
                bottom: (offsetHeight - top - point.y) + 'px',
                //top: point.y + 'px',
                left: point.x + 'px'
            })
            .html(htmlFunc(d));
    }
    function hide() {
        hoverEl.css(options.hoverLeaveStyle);
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
            
        if (!options.center) {
            // zoom to globally set center by default
            options.center = [center.x, center.y];
        }

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
                var el = this;
                options.zoomstart && options.zoomstart.call(map, el);
                map.zoomToSelection(this, {
                    callback: function() {
                        options.zoomend && options.zoomend.call(map, el);
                    },
                    maxZoom: options.maxZoom
                });
                animateRing(this);
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
            maxZoom: options.maxZoom
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
        maxZoom: 8
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
        translate = [size.width * center.x - scale * x, size.height * center.y - scale * y];
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
    var map = this;
    this._promise.geometry.then(function(topo) {
        var sel = map.getRepresentations(selection);
        if (typeof spec == 'function') {
            spec.call(map, sel);
        }
        else {
            throw "Behavior " + spec + " not a function";
        }
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

function defaultRangeLabel(a, b, format, excludeLower) {
    format = format || function(a){return a};
    var lower = excludeLower ? '> ' : '';
    if (isNaN(a) && !isNaN(b)) {
        return "up to " + format(b);
    }
    if (isNaN(b) && !isNaN(a)) {
        return lower + format(a) + " and above";
    }
    return (lower + format(a) + " to " + format(b));
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
        rangeLabel: defaultRangeLabel
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
        rangeLabel: function(a, b, format, excludeLower) {
            format = format || function(a){return a};
            var lower = excludeLower ? '> ' : '';
            if (isNaN(a) && !isNaN(b)) {
                return "bis zu " + format(b);
            }
            if (isNaN(b) && !isNaN(a)) {
                return lower + format(a) + " und mehr";
            }
            return (lower + format(a) + " bis " + format(b));
        }
    }
};

var optionsListeners = {
    'locale': function(val, old_val) {
        this.setLocale(val);
        return this;
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
    // HACK: we cannot extend d3 locale properly
    this.locale.rangeLabel = locale.rangeLabel;
    
    return this;
}

mapmap.prototype.options = function(spec, value) {
    // get/set indexed property
    // http://stackoverflow.com/a/6394168/171579
    function propertyDeep(obj, is, value) {
        if (typeof is == 'string')
            return propertyDeep(obj,is.split('.'), value);
        else if (is.length==1 && value!==undefined) {
            obj[is[0]] = value;
            return value;
        }
        else if (is.length==0)
            return obj;
        else
            return propertyDeep(obj[is[0]],is.slice(1), value);
    }
    if (typeof spec == 'string') {
        if (optionsListeners[spec]) {
            optionsListeners[spec].call(this, value, propertyDeep(this.settings, spec, value));
        }
        else {
            propertyDeep(this.settings, spec, value);
        }
    }
    else {
        var old = mapmap.extend(true, {}, this.settings);
        mapmap.extend(true, this.settings, spec);
        // TODO: this is quite inefficient, should be integrated into a custom extend() function
        var keys = Object.keys(optionsListeners);
        for (var i=0; i<keys.length; i++) {
            var a = propertyDeep(old, keys[i]),
                b = propertyDeep(this.settings, keys[i]);
            if (a !== b) {
                optionsListeners[keys[i]].call(this, b, a);
            }
        }
        
    }
    //settings.legendOptions.containerAttributes.transform = value;
    return this;
};

mapmap.prototype.legend = function(legend_func) {
    this.legend_func = legend_func;
    return this;
}
mapmap.prototype.updateLegend = function(value, metadata, scale, selection) {

    if (!this.legend_func || !scale) {
        return this;
    }
    
    if (typeof metadata == 'string') {
        metadata = mapmap.getMetadata(metadata);
    }
    
    var range = scale.range().slice(0), // clone, we might reverse() later
        labelFormat,
        thresholds;
        
    var map = this;

    // set up labels and histogram bins according to scale
    if (scale.invertExtent) {
        // for quantization scales we have invertExtent to fully specify bins
        labelFormat = function(d,i) {
            var extent = scale.invertExtent(d);
            if (map.locale && map.locale.rangeLabel) {
                return map.locale.rangeLabel(extent[0], extent[1], metadata.format.bind(metadata), (i<range.length-1));
            }
            return defaultRangeLabel(extent[0], extent[1], metadata.format.bind(metadata), (i<range.length-1));
        };
    }
    else {
        // ordinal scales
        labelFormat = metadata.getFormatter();
    }
    
    var histogram = null;

    if (scale.invertExtent) {
        var hist_range = scale.range();
        thresholds = [scale.invertExtent(hist_range[0])[0]];
        for (var i=0; i<hist_range.length; i++) {
            var extent = scale.invertExtent(hist_range[i]);
            thresholds.push(extent[1]);
        }
    }
    else {
        // ordinal scales
        thresholds = range.length;
    }
    
    var histogram_objects = this.getRepresentations(selection)[0];
    
    var make_histogram = d3.layout.histogram()
        .bins(thresholds)
        .value(function(d){
            return d.__data__.properties[value];
        })
        // use "density" mode, giving us histogram y values in the range of [0..1]
        .frequency(false);

    histogram = make_histogram(histogram_objects);
    
    this.legend_func.call(this, value, metadata, range, labelFormat, histogram);
                    
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
        histogramBarStyle: {},
        textStyle: {}
    };
    
    options = mapmap.extend(DEFAULTS, options);
    
    return function(value, metadata, range, labelFormat, histogram) {
    
        var legend = this._elements.parent.find('.' + options.legendClassName);
        if (legend.length == 0) {
            legend = $('<div class="' + options.legendClassName + '"></div>');
            this._elements.parent.prepend(legend);
        }
        legend = d3.select(legend[0]);
        
        legend.style(options.legendStyle);
        
        // TODO: value may be a function, so we cannot easily generate a label for it
        var title = legend.selectAll('h3')
            .data([valueOrCall(metadata.label, value) || (dd.isString(value) ? value : '')]);
            
        title.enter()
            .append('h3');
        
        title
            .html(function(d){return d;});
        
        // we need highest values first for numeric scales
        if (metadata.scale != 'ordinal') {
            range.reverse();
        }
        
        var cells = legend.selectAll('div.legendCell')
            .data(range);
        
        cells.exit().remove();
        
        var newcells = cells.enter()
            .append('div')
            .attr('class', 'legendCell')
            .style(options.cellStyle);
            
        newcells.append('span')
            .attr('class', 'legendColor')
            .style(options.colorBoxStyle)
            .append('span')
            .attr('class', 'fill')
            .style(options.colorFillStyle);
                    
        newcells.append('span')
            .attr('class','legendLabel')
            .style(options.textStyle);
        
        if (options.histogram) {

            newcells.append('span')
                .attr('class', 'legendHistogramBar')
                .style(options.histogramBarStyle);

            cells.select('.legendHistogramBar').transition()
                .style('width', function(d,i){
                    var width = (histogram[histogram.length-i-1].y * options.histogramLength);
                    // always round up to make sure at least 1px wide
                    if (width > 0 && width < 1) width = 1;
                    return Math.round(width) + 'px';
                });
        }

        cells.select('.legendColor .fill')
            .transition()
            .style({
                'background-color': function(d) {return d;},
                'border-color': function(d) {return d;},
                'color': function(d) {return d;}
            });
        
        cells.select('.legendLabel')
            .text(labelFormat);
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
            $.merge(all, topojson.feature(geom, geom.objects[names[i]]).features);
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
},{"datadata":3}],3:[function(require,module,exports){
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
                    var key = keys[i];
                    // convert to number if it looks like a number
                    if (!isNaN(+d[key])) {
                        d[key] = +d[key];
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
// DO NOT USE - present only for legacy reasons
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
            return new Promise(function(resolve, reject) {
                d3.csv(spec, function(row) {
                    var keys = Object.keys(row);
                    for (var i=0; i<keys.length; i++) {
                        var key = keys[i];
                        if (!isNaN(+row[key])) { // in JavaScript, NaN !== NaN !!!
                            // convert to number if number
                            row[key] = +row[key];
                        }
                    }
                    return row;
                },
                function(error, data) {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve(data);                    
                });
            });
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

},{"d3-dsv":1,"fs":1}]},{},[2])(2)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi4uL2Jyb3dzZXJpZnkvbGliL19lbXB0eS5qcyIsInNyYy9pbmRleC5qcyIsIi4uLy4uLy4uL2RhdGFkYXRhL3NyYy9pbmRleC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcHpFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLG51bGwsIi8qISBtYXBtYXAuanMgMC4yLjYgwqkgMjAxNC0yMDE1IEZsb3JpYW4gTGVkZXJtYW5uIFxyXG5cclxuVGhpcyBwcm9ncmFtIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcclxuaXQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBHTlUgQWZmZXJvIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYXMgcHVibGlzaGVkIGJ5XHJcbnRoZSBGcmVlIFNvZnR3YXJlIEZvdW5kYXRpb24sIGVpdGhlciB2ZXJzaW9uIDMgb2YgdGhlIExpY2Vuc2UsIG9yXHJcbihhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXHJcblxyXG5UaGlzIHByb2dyYW0gaXMgZGlzdHJpYnV0ZWQgaW4gdGhlIGhvcGUgdGhhdCBpdCB3aWxsIGJlIHVzZWZ1bCxcclxuYnV0IFdJVEhPVVQgQU5ZIFdBUlJBTlRZOyB3aXRob3V0IGV2ZW4gdGhlIGltcGxpZWQgd2FycmFudHkgb2ZcclxuTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxyXG5HTlUgQWZmZXJvIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgZm9yIG1vcmUgZGV0YWlscy5cclxuXHJcbllvdSBzaG91bGQgaGF2ZSByZWNlaXZlZCBhIGNvcHkgb2YgdGhlIEdOVSBBZmZlcm8gR2VuZXJhbCBQdWJsaWMgTGljZW5zZVxyXG5hbG9uZyB3aXRoIHRoaXMgcHJvZ3JhbS4gIElmIG5vdCwgc2VlIDxodHRwOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cclxuKi9cclxuXHJcbnZhciBkZCA9IHJlcXVpcmUoJ2RhdGFkYXRhJyk7XHJcblxyXG52YXIgdmVyc2lvbiA9ICcwLjIuNic7XHJcblxyXG4vLyBUT0RPOiBjYW4gd2UgZ2V0IHJpZCBvZiBqUXVlcnkgZGVwZW5kZW5jeSB0aHJvdWdoIHZhciBleHRlbmQgPSByZXF1aXJlKFwianF1ZXJ5LWV4dGVuZFwiKT9cclxuZnVuY3Rpb24gX2Fzc2VydCh0ZXN0LCBtZXNzYWdlKSB7IGlmICh0ZXN0KSByZXR1cm47IHRocm93IG5ldyBFcnJvcihcIlttYXBtYXBdIFwiICsgbWVzc2FnZSk7fVxyXG5fYXNzZXJ0KGQzLCBcImQzLmpzIGlzIHJlcXVpcmVkIVwiKTtcclxuX2Fzc2VydCgkLCBcImpRdWVyeSBpcyByZXF1aXJlZCFcIik7XHJcblxyXG52YXIgZGVmYXVsdF9zZXR0aW5ncyA9IHtcclxuICAgIGxvY2FsZTogJ2VuJyxcclxuICAgIGtlZXBBc3BlY3RSYXRpbzogdHJ1ZSxcclxuICAgIHBsYWNlaG9sZGVyQ2xhc3NOYW1lOiAncGxhY2Vob2xkZXInLFxyXG4gICAgc3ZnQXR0cmlidXRlczoge1xyXG4gICAgICAgICdvdmVyZmxvdyc6ICdoaWRkZW4nIC8vIG5lZWRlZCBmb3IgSUVcclxuICAgIH0sXHJcbiAgICBwYXRoQXR0cmlidXRlczoge1xyXG4gICAgICAgICdmaWxsJzogJ25vbmUnLFxyXG4gICAgICAgICdzdHJva2UnOiAnIzAwMCcsXHJcbiAgICAgICAgJ3N0cm9rZS13aWR0aCc6ICcwLjJweCcsXHJcbiAgICAgICAgJ3N0cm9rZS1saW5lam9pbic6ICdiZXZlbCcsXHJcbiAgICAgICAgJ3BvaW50ZXItZXZlbnRzJzogJ25vbmUnXHJcbiAgICB9LFxyXG4gICAgYmFja2dyb3VuZEF0dHJpYnV0ZXM6IHtcclxuICAgICAgICAnd2lkdGgnOiAnMzAwJScsXHJcbiAgICAgICAgJ2hlaWdodCc6ICczMDAlJyxcclxuICAgICAgICAnZmlsbCc6ICdub25lJyxcclxuICAgICAgICAnc3Ryb2tlJzogJ25vbmUnLFxyXG4gICAgICAgICd0cmFuc2Zvcm0nOiAndHJhbnNsYXRlKC04MDAsLTQwMCknLFxyXG4gICAgICAgICdwb2ludGVyLWV2ZW50cyc6ICdhbGwnXHJcbiAgICB9LFxyXG4gICAgb3ZlcmxheUF0dHJpYnV0ZXM6IHtcclxuICAgICAgICAnZmlsbCc6ICcjZmZmZmZmJyxcclxuICAgICAgICAnZmlsbC1vcGFjaXR5JzogJzAuMicsXHJcbiAgICAgICAgJ3N0cm9rZS13aWR0aCc6ICcwLjgnLFxyXG4gICAgICAgICdzdHJva2UnOiAnIzMzMycsXHJcbiAgICAgICAgJ3BvaW50ZXItZXZlbnRzJzogJ25vbmUnXHJcbiAgICB9LFxyXG4gICAgZGVmYXVsdE1ldGFkYXRhOiB7XHJcbiAgICAgICAgLy8gZG9tYWluOiAgaXMgZGV0ZXJtaW5lZCBieSBkYXRhIGFuYWx5c2lzXHJcbiAgICAgICAgc2NhbGU6ICdxdWFudGl6ZScsXHJcbiAgICAgICAgY29sb3JzOiBbXCIjZmZmZmNjXCIsXCIjYzdlOWI0XCIsXCIjN2ZjZGJiXCIsXCIjNDFiNmM0XCIsXCIjMmM3ZmI4XCIsXCIjMjUzNDk0XCJdLCAvLyBDb2xvcmJyZXdlciBZbEduQnVbNl0gXHJcbiAgICAgICAgdW5kZWZpbmVkVmFsdWU6IFwiXCIgLy9cInVuZGVmaW5lZFwiXHJcbiAgICB9XHJcbn07XHJcblxyXG52YXIgbWFwbWFwID0gZnVuY3Rpb24oZWxlbWVudCwgb3B0aW9ucykge1xyXG4gICAgLy8gZW5zdXJlIGNvbnN0cnVjdG9yIGludm9jYXRpb25cclxuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBtYXBtYXApKSByZXR1cm4gbmV3IG1hcG1hcChlbGVtZW50LCBvcHRpb25zKTtcclxuXHJcbiAgICB0aGlzLnNldHRpbmdzID0ge307ICAgIFxyXG4gICAgdGhpcy5vcHRpb25zKG1hcG1hcC5leHRlbmQodHJ1ZSwge30sIGRlZmF1bHRfc2V0dGluZ3MsIG9wdGlvbnMpKTtcclxuICAgIFxyXG4gICAgLy8gcHJvbWlzZXNcclxuICAgIHRoaXMuX3Byb21pc2UgPSB7XHJcbiAgICAgICAgZ2VvbWV0cnk6IG51bGwsXHJcbiAgICAgICAgZGF0YTogbnVsbFxyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLnNlbGVjdGVkID0gbnVsbDtcclxuICAgIFxyXG4gICAgdGhpcy5sYXllcnMgPSBuZXcgZGQuT3JkZXJlZEhhc2goKTtcclxuICAgIC8vdGhpcy5pZGVudGlmeV9mdW5jID0gaWRlbnRpZnlfbGF5ZXI7XHJcbiAgICB0aGlzLmlkZW50aWZ5X2Z1bmMgPSBpZGVudGlmeV9ieV9wcm9wZXJ0aWVzKCk7XHJcbiAgICBcclxuICAgIHRoaXMubWV0YWRhdGFfc3BlY3MgPSBbXTsgICBcclxuXHJcbiAgICAvLyBjb252ZXJ0IHNlbGV0b3IgZXhwcmVzc2lvbiB0byBub2RlXHJcbiAgICBlbGVtZW50ID0gZDMuc2VsZWN0KGVsZW1lbnQpLm5vZGUoKTtcclxuIFxyXG4gICAgLy8gZGVmYXVsdHNcclxuICAgIHRoaXMuX3Byb2plY3Rpb24gPSBkMy5nZW8ubWVyY2F0b3IoKS5zY2FsZSgxKTtcclxuICAgIFxyXG4gICAgdGhpcy5pbml0RW5naW5lKGVsZW1lbnQpO1xyXG4gICAgdGhpcy5pbml0RXZlbnRzKGVsZW1lbnQpO1xyXG4gICAgXHJcbiAgICB0aGlzLmRpc3BhdGNoZXIgPSBkMy5kaXNwYXRjaCgnY2hvcm9wbGV0aCcsJ3ZpZXcnLCdjbGljaycsJ21vdXNlZG93bicsJ21vdXNldXAnLCdtb3VzZW1vdmUnKTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHRoaXM7ICAgIFxyXG59O1xyXG5cclxuLy8gZXhwb3NlIGRhdGFkYXRhIGxpYnJhcnkgaW4gY2FzZSB3ZSBhcmUgYnVuZGxlZCBmb3IgYnJvd3NlclxyXG4vLyB0aGlzIGlzIGEgaGFjayBhcyBicm93c2VyaWZ5IGRvZXNuJ3Qgc3VwcG9ydCBtdXRsaXBsZSBnbG9iYWwgZXhwb3J0c1xyXG5tYXBtYXAuZGF0YWRhdGEgPSBkZDtcclxuXHJcbm1hcG1hcC5wcm90b3R5cGUgPSB7XHJcblx0dmVyc2lvbjogdmVyc2lvblxyXG59O1xyXG5cclxubWFwbWFwLmV4dGVuZCA9ICQuZXh0ZW5kO1xyXG4vKlxyXG4vLyBUT0RPOiB0aGlzIG9yIGpxdWVyeS1leHRlbmQgdG8gZ2V0IHJpZCBvZiBqcXVlcnkgZGVwLj9cclxuLy8gaHR0cDovL2FuZHJld2R1cG9udC5uZXQvMjAwOS8wOC8yOC9kZWVwLWV4dGVuZGluZy1vYmplY3RzLWluLWphdmFzY3JpcHQvXHJcbm1hcG1hcC5leHRlbmQgPSBmdW5jdGlvbihkZXN0aW5hdGlvbiwgc291cmNlKSB7XHJcbiAgZm9yICh2YXIgcHJvcGVydHkgaW4gc291cmNlKSB7XHJcbiAgICBpZiAoc291cmNlW3Byb3BlcnR5XSAmJiBzb3VyY2VbcHJvcGVydHldLmNvbnN0cnVjdG9yICYmIHNvdXJjZVtwcm9wZXJ0eV0uY29uc3RydWN0b3IgPT09IE9iamVjdCkge1xyXG4gICAgICBkZXN0aW5hdGlvbltwcm9wZXJ0eV0gPSBkZXN0aW5hdGlvbltwcm9wZXJ0eV0gfHwge307XHJcbiAgICAgIG1hcG1hcC5leHRlbmQoZGVzdGluYXRpb25bcHJvcGVydHldLCBzb3VyY2VbcHJvcGVydHldKTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICBkZXN0aW5hdGlvbltwcm9wZXJ0eV0gPSBzb3VyY2VbcHJvcGVydHldO1xyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gZGVzdGluYXRpb247XHJcbn07XHJcbiovXHJcblxyXG5tYXBtYXAucHJvdG90eXBlLmluaXRFbmdpbmUgPSBmdW5jdGlvbihlbGVtZW50KSB7XHJcbiAgICAvLyBTVkcgc3BlY2lmaWMgaW5pdGlhbGl6YXRpb24sIGZvciBub3cgd2UgaGF2ZSBubyBlbmdpbmUgc3dpdGNoaW5nIGZ1bmN0aW9uYWxpdHlcclxuICAgIFxyXG4gICAgLy8gSFRNTCBlbGVtZW50cywgc3RvcmVkIGFzIGQzIHNlbGVjdGlvbnMgICAgXHJcbiAgICB2YXIgbWFpbkVsID0gZDMuc2VsZWN0KGVsZW1lbnQpLmNsYXNzZWQoJ21hcG1hcCcsIHRydWUpLFxyXG4gICAgICAgIG1hcEVsID0gbWFpbkVsLmFwcGVuZCgnZycpLmF0dHIoJ2NsYXNzJywgJ21hcCcpO1xyXG4gICAgXHJcbiAgICBtYWluRWwuYXR0cih0aGlzLnNldHRpbmdzLnN2Z0F0dHJpYnV0ZXMpO1xyXG4gICAgXHJcbiAgICB0aGlzLl9lbGVtZW50cyA9IHtcclxuICAgICAgICBtYWluOiBtYWluRWwsXHJcbiAgICAgICAgbWFwOiBtYXBFbCxcclxuICAgICAgICBwYXJlbnQ6ICQobWFpbkVsLm5vZGUoKSkucGFyZW50KCksXHJcbiAgICAgICAgLy8gY2hpbGQgZWxlbWVudHNcclxuICAgICAgICBkZWZzOiBtYWluRWwuaW5zZXJ0KCdkZWZzJywgJy5tYXAnKSxcclxuICAgICAgICBiYWNrZ3JvdW5kR2VvbWV0cnk6IG1hcEVsLmFwcGVuZCgnZycpLmF0dHIoJ2NsYXNzJywgJ2JhY2tncm91bmQtZ2VvbWV0cnknKSxcclxuICAgICAgICBiYWNrZ3JvdW5kOiBtYXBFbC5hcHBlbmQoJ3JlY3QnKS5hdHRyKCdjbGFzcycsICdiYWNrZ3JvdW5kJykuYXR0cih0aGlzLnNldHRpbmdzLmJhY2tncm91bmRBdHRyaWJ1dGVzKSxcclxuICAgICAgICBzaGFkb3dHcm91cDogbWFwRWwuYXBwZW5kKCdnJyksXHJcbiAgICAgICAgZ2VvbWV0cnk6IG1hcEVsLmFwcGVuZCgnZycpLmF0dHIoJ2NsYXNzJywgJ2dlb21ldHJ5JyksXHJcbiAgICAgICAgb3ZlcmxheTogbWFwRWwuYXBwZW5kKCdnJykuYXR0cignY2xhc3MnLCAnb3ZlcmxheXMnKSxcclxuICAgICAgICBmaXhlZDogbWFpbkVsLmFwcGVuZCgnZycpLmF0dHIoJ2NsYXNzJywgJ2ZpeGVkJyksXHJcbiAgICAgICAgbGVnZW5kOiBtYWluRWwuYXBwZW5kKCdnJykuYXR0cignY2xhc3MnLCAnbGVnZW5kJyksXHJcbiAgICAgICAgcGxhY2Vob2xkZXI6IG1haW5FbC5zZWxlY3QoJy4nICsgdGhpcy5zZXR0aW5ncy5wbGFjZWhvbGRlckNsYXNzTmFtZSlcclxuICAgIH07XHJcbiAgICBcclxuICAgIC8vIHNldCB1cCB3aWR0aC9oZWlnaHRcclxuICAgIHRoaXMud2lkdGggPSBudWxsO1xyXG4gICAgdGhpcy5oZWlnaHQgPSBudWxsO1xyXG4gICAgXHJcbiAgICBpZiAoIXRoaXMud2lkdGgpIHtcclxuICAgICAgICB0aGlzLndpZHRoID0gcGFyc2VJbnQobWFpbkVsLmF0dHIoJ3dpZHRoJykpIHx8IDgwMDtcclxuICAgIH1cclxuICAgIGlmICghdGhpcy5oZWlnaHQpIHtcclxuICAgICAgICB0aGlzLmhlaWdodCA9IHBhcnNlSW50KG1haW5FbC5hdHRyKCdoZWlnaHQnKSkgfHwgNDAwO1xyXG4gICAgfVxyXG4gICAgdmFyIHZpZXdCb3ggPSBtYWluRWwuYXR0cigndmlld0JveCcpO1xyXG4gICAgaWYgKCF2aWV3Qm94KSB7XHJcbiAgICAgICAgbWFpbkVsLmF0dHIoJ3ZpZXdCb3gnLCAnMCAwICcgKyB0aGlzLndpZHRoICsgJyAnICsgdGhpcy5oZWlnaHQpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB0aGlzLl9lbGVtZW50cy5kZWZzLmFwcGVuZCgnZmlsdGVyJylcclxuICAgICAgICAuYXR0cignaWQnLCAnc2hhZG93LWdsb3cnKVxyXG4gICAgICAgIC5hcHBlbmQoJ2ZlR2F1c3NpYW5CbHVyJylcclxuICAgICAgICAuYXR0cignc3RkRGV2aWF0aW9uJywgNSk7XHJcblxyXG4gICAgdGhpcy5fZWxlbWVudHMuZGVmcy5hcHBlbmQoJ2ZpbHRlcicpXHJcbiAgICAgICAgLmF0dHIoJ2lkJywgJ2xpZ2h0LWdsb3cnKVxyXG4gICAgICAgIC5hcHBlbmQoJ2ZlR2F1c3NpYW5CbHVyJylcclxuICAgICAgICAuYXR0cignc3RkRGV2aWF0aW9uJywgMSk7XHJcbiAgICBcclxuICAgIHRoaXMuX2VsZW1lbnRzLnNoYWRvd0VsID0gdGhpcy5fZWxlbWVudHMuc2hhZG93R3JvdXBcclxuICAgICAgICAuYXBwZW5kKCdnJylcclxuICAgICAgICAuYXR0cignY2xhc3MnLCAnc2hhZG93JylcclxuICAgICAgICAuYXR0cignZmlsdGVyJywgJ3VybCgjc2hhZG93LWdsb3cpJyk7XHJcbiAgICAgICAgXHJcbiAgICB0aGlzLl9lbGVtZW50cy5zaGFkb3dDcm9wRWwgPSB0aGlzLl9lbGVtZW50cy5zaGFkb3dHcm91cFxyXG4gICAgICAgIC5hcHBlbmQoJ2cnKVxyXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdzaGFkb3ctY3JvcCcpO1xyXG4gICAgICAgXHJcbiAgICB0aGlzLnN1cHBvcnRzID0ge307XHJcbiAgICBcclxuICAgIC8vIGZlYXR1cmUgZGV0ZWN0aW9uXHJcbiAgICB2YXIgZWwgPSB0aGlzLl9lbGVtZW50cy5tYWluLmFwcGVuZCgncGF0aCcpLmF0dHIoe1xyXG4gICAgICAgICdwYWludC1vcmRlcic6ICdzdHJva2UnLFxyXG4gICAgICAgICd2ZWN0b3ItZWZmZWN0JzogJ25vbi1zY2FsaW5nLXN0cm9rZSdcclxuICAgIH0pOyAgXHJcbiAgICBcclxuICAgIHZhciB2YWwgPSBnZXRDb21wdXRlZFN0eWxlKGVsLm5vZGUoKSkuZ2V0UHJvcGVydHlWYWx1ZSgncGFpbnQtb3JkZXInKTtcclxuICAgIHRoaXMuc3VwcG9ydHMucGFpbnRPcmRlciA9IHZhbCAmJiB2YWwuaW5kZXhPZignc3Ryb2tlJykgPT0gMDtcclxuICAgIFxyXG4gICAgdmFsID0gZ2V0Q29tcHV0ZWRTdHlsZShlbC5ub2RlKCkpLmdldFByb3BlcnR5VmFsdWUoJ3ZlY3Rvci1lZmZlY3QnKTtcclxuICAgIHRoaXMuc3VwcG9ydHMubm9uU2NhbGluZ1N0cm9rZSA9IHZhbCAmJiB2YWwuaW5kZXhPZignbm9uLXNjYWxpbmctc3Ryb2tlJykgPT0gMDtcclxuICAgIHRoaXMuX2VsZW1lbnRzLm1haW4uY2xhc3NlZCgnc3VwcG9ydHMtbm9uLXNjYWxpbmctc3Ryb2tlJywgdGhpcy5zdXBwb3J0cy5ub25TY2FsaW5nU3Ryb2tlKTtcclxuICAgICAgICBcclxuICAgIGVsLnJlbW92ZSgpO1xyXG4gICAgXHJcbiAgICAvLyBhbnkgSUU/XHJcbiAgICBpZiAobmF2aWdhdG9yLnVzZXJBZ2VudC5pbmRleE9mKCdNU0lFJykgIT09IC0xIHx8IG5hdmlnYXRvci5hcHBWZXJzaW9uLmluZGV4T2YoJ1RyaWRlbnQvJykgPiAwKSB7XHJcbiAgICAgICAgdGhpcy5zdXBwb3J0cy5ob3ZlckRvbU1vZGlmaWNhdGlvbiA9IGZhbHNlO1xyXG4gICAgfVxyXG4gICAgZWxzZSB7XHJcbiAgICAgICAgdGhpcy5zdXBwb3J0cy5ob3ZlckRvbU1vZGlmaWNhdGlvbiA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIG1hcCA9IHRoaXM7XHJcbiAgICAvLyBzYXZlIHZpZXdwb3J0IHN0YXRlIHNlcGFyYXRlbHksIGFzIHpvb20gbWF5IG5vdCBoYXZlIGV4YWN0IHZhbHVlcyAoZHVlIHRvIGFuaW1hdGlvbiBpbnRlcnBvbGF0aW9uKVxyXG4gICAgdGhpcy5jdXJyZW50X3NjYWxlID0gMTtcclxuICAgIHRoaXMuY3VycmVudF90cmFuc2xhdGUgPSBbMCwwXTtcclxuICAgIFxyXG4gICAgdGhpcy56b29tID0gZDMuYmVoYXZpb3Iuem9vbSgpXHJcbiAgICAgICAgLnRyYW5zbGF0ZShbMCwgMF0pXHJcbiAgICAgICAgLnNjYWxlKDEpXHJcbiAgICAgICAgLnNjYWxlRXh0ZW50KFsxLCA4XSlcclxuICAgICAgICAub24oJ3pvb20nLCBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIG1hcC5jdXJyZW50X3NjYWxlID0gZDMuZXZlbnQuc2NhbGU7XHJcbiAgICAgICAgICAgIG1hcC5jdXJyZW50X3RyYW5zbGF0ZSA9IGQzLmV2ZW50LnRyYW5zbGF0ZTtcclxuICAgICAgICAgICAgbWFwRWwuYXR0cigndHJhbnNmb3JtJywgJ3RyYW5zbGF0ZSgnICsgZDMuZXZlbnQudHJhbnNsYXRlICsgJylzY2FsZSgnICsgZDMuZXZlbnQuc2NhbGUgKyAnKScpO1xyXG4gICAgICAgICAgICBpZiAoIW1hcC5zdXBwb3J0cy5ub25TY2FsaW5nU3Ryb2tlKSB7XHJcbiAgICAgICAgICAgICAgICAvL21hcC5fZWxlbWVudHMuZ2VvbWV0cnkuc2VsZWN0QWxsKFwicGF0aFwiKS5zdHlsZShcInN0cm9rZS13aWR0aFwiLCAxLjUgLyBkMy5ldmVudC5zY2FsZSArIFwicHhcIik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICBtYXBFbFxyXG4gICAgICAgIC8vLmNhbGwodGhpcy56b29tKSAvLyBmcmVlIG1vdXNld2hlZWwgem9vbWluZ1xyXG4gICAgICAgIC5jYWxsKHRoaXMuem9vbS5ldmVudCk7XHJcbiAgICAgIC8qICBcclxuICAgIHZhciBkcmFnID0gZDMuYmVoYXZpb3IuZHJhZygpXHJcbiAgICAgICAgLm9yaWdpbihmdW5jdGlvbigpIHtyZXR1cm4ge3g6bWFwLmN1cnJlbnRfdHJhbnNsYXRlWzBdLHk6bWFwLmN1cnJlbnRfdHJhbnNsYXRlWzFdfTt9KVxyXG4gICAgICAgIC5vbignZHJhZ3N0YXJ0JywgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIGQzLmV2ZW50LnNvdXJjZUV2ZW50LnN0b3BQcm9wYWdhdGlvbigpOyBcclxuICAgICAgICB9KVxyXG4gICAgICAgIC5vbignZHJhZ2VuZCcsIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICBkMy5ldmVudC5zb3VyY2VFdmVudC5zdG9wUHJvcGFnYXRpb24oKTsgXHJcbiAgICAgICAgfSlcclxuICAgICAgICAub24oJ2RyYWcnLCBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgbWFwLmN1cnJlbnRfdHJhbnNsYXRlID0gW2QzLmV2ZW50LngsIGQzLmV2ZW50LnldO1xyXG4gICAgICAgICAgICBtYXBFbC5hdHRyKCd0cmFuc2Zvcm0nLCAndHJhbnNsYXRlKCcgKyBkMy5ldmVudC54ICsgJywnICsgZDMuZXZlbnQueSArICcpc2NhbGUoJyArIG1hcC5jdXJyZW50X3NjYWxlICsgJyknKTtcclxuICAgICAgICB9KVxyXG4gICAgOyovXHJcbiAgICAgICAgXHJcbiAgICAvL21hcEVsLmNhbGwoZHJhZyk7XHJcbiAgICBcclxuICAgIFxyXG4gICAgdmFyIG1hcCA9IHRoaXM7XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNvbnN0cnVjdEV2ZW50KGV2ZW50KSB7XHJcbiAgICAgICAgLy8gVE9ETzogbWF5YmUgdGhpcyBzaG91bGQgYmUgb2Zmc2V0WC9ZLCBidXQgdGhlbiB3ZSBuZWVkIHRvIGNoYW5nZVxyXG4gICAgICAgIC8vIHpvb21Ub1ZpZXdwb3J0UG9zaXRpb24gdG8gc3VwcG9ydCBjbGljay10by16b29tXHJcbiAgICAgICAgdmFyIHBvcyA9IFtldmVudC5jbGllbnRYLCBldmVudC5jbGllbnRZXVxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBwb3MsXHJcbiAgICAgICAgICAgIGxvY2F0aW9uOiBtYXAuX3Byb2plY3Rpb24uaW52ZXJ0KHBvcyksXHJcbiAgICAgICAgICAgIGV2ZW50OiBldmVudFxyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgbWFwRWwub24oJ2NsaWNrJywgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgLy8gVE9ETzogY2hlY2sgaWYgYW55b25lIGlzIGxpc3RlbmluZywgZWxzZSByZXR1cm4gaW1tZWRpYXRlbHlcclxuICAgICAgICBtYXAuZGlzcGF0Y2hlci5jbGljay5jYWxsKG1hcCwgY29uc3RydWN0RXZlbnQoZDMuZXZlbnQpKTtcclxuICAgIH0pO1xyXG5cclxuICAgIG1hcEVsLm9uKCdtb3VzZWRvd24nLCBmdW5jdGlvbigpIHtcclxuICAgICAgICAvLyBUT0RPOiBjaGVjayBpZiBhbnlvbmUgaXMgbGlzdGVuaW5nLCBlbHNlIHJldHVybiBpbW1lZGlhdGVseVxyXG4gICAgICAgIG1hcC5kaXNwYXRjaGVyLm1vdXNlZG93bi5jYWxsKG1hcCwgY29uc3RydWN0RXZlbnQoZDMuZXZlbnQpKTtcclxuICAgIH0pO1xyXG5cclxuICAgIG1hcEVsLm9uKCdtb3VzZXVwJywgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgLy8gVE9ETzogY2hlY2sgaWYgYW55b25lIGlzIGxpc3RlbmluZywgZWxzZSByZXR1cm4gaW1tZWRpYXRlbHlcclxuICAgICAgICBtYXAuZGlzcGF0Y2hlci5tb3VzZWRvd24uY2FsbChtYXAsIGNvbnN0cnVjdEV2ZW50KGQzLmV2ZW50KSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBtYXBFbC5vbignbW91c2Vtb3ZlJywgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgLy8gVE9ETzogY2hlY2sgaWYgYW55b25lIGlzIGxpc3RlbmluZywgZWxzZSByZXR1cm4gaW1tZWRpYXRlbHlcclxuICAgICAgICBtYXAuZGlzcGF0Y2hlci5tb3VzZWRvd24uY2FsbChtYXAsIGNvbnN0cnVjdEV2ZW50KGQzLmV2ZW50KSk7XHJcbiAgICB9KTtcclxuXHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLmluaXRFdmVudHMgPSBmdW5jdGlvbihlbGVtZW50KSB7XHJcbiAgICB2YXIgbWFwID0gdGhpcztcclxuICAgIC8vIGtlZXAgYXNwZWN0IHJhdGlvIG9uIHJlc2l6ZVxyXG4gICAgZnVuY3Rpb24gcmVzaXplKCkge1xyXG4gICAgXHJcbiAgICAgICAgbWFwLmJvdW5kcyA9IG1hcC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAobWFwLnNldHRpbmdzLmtlZXBBc3BlY3RSYXRpbykge1xyXG4gICAgICAgICAgICB2YXIgd2lkdGggPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnd2lkdGgnKSxcclxuICAgICAgICAgICAgICAgIGhlaWdodCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdoZWlnaHQnKTtcclxuICAgICAgICAgICAgaWYgKHdpZHRoICYmIGhlaWdodCAmJiBtYXAuYm91bmRzLndpZHRoKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgcmF0aW8gPSB3aWR0aCAvIGhlaWdodDtcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gKG1hcC5ib3VuZHMud2lkdGggLyByYXRpbykgKyAncHgnO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICB3aW5kb3cub25yZXNpemUgPSByZXNpemU7XHJcbiAgICBcclxuICAgIHJlc2l6ZSgpO1xyXG59O1xyXG5cclxudmFyIGRvbWFpbiA9IFswLDFdO1xyXG5cclxudmFyIGxheWVyX2NvdW50ZXIgPSAwO1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5nZW9tZXRyeSA9IGZ1bmN0aW9uKHNwZWMsIGtleU9yT3B0aW9ucykge1xyXG5cclxuICAgIC8vIGtleSBpcyBkZWZhdWx0IG9wdGlvblxyXG4gICAgdmFyIG9wdGlvbnMgPSBkZC5pc1N0cmluZyhrZXlPck9wdGlvbnMpID8ge2tleToga2V5T3JPcHRpb25zfSA6IGtleU9yT3B0aW9ucztcclxuXHJcbiAgICBvcHRpb25zID0gZGQubWVyZ2Uoe1xyXG4gICAgICAgIGtleTogJ2lkJyxcclxuICAgICAgICAvLyBsYXllcnM6IHRha2VuIGZyb20gaW5wdXQgb3IgYXV0by1nZW5lcmF0ZWQgbGF5ZXIgbmFtZVxyXG4gICAgfSwgb3B0aW9ucyk7XHJcblxyXG4gICAgdmFyIG1hcCA9IHRoaXM7XHJcbiAgICBcclxuICAgIGlmIChkZC5pc0Z1bmN0aW9uKHNwZWMpKSB7XHJcbiAgICAgICAgdGhpcy5fcHJvbWlzZS5nZW9tZXRyeS50aGVuKGZ1bmN0aW9uKHRvcG8pe1xyXG4gICAgICAgICAgICB2YXIgbmV3X3RvcG8gPSBzcGVjKHRvcG8pO1xyXG4gICAgICAgICAgICBpZiAodHlwZW9mIG5ld190b3BvLmxlbmd0aCA9PSAndW5kZWZpbmVkJykge1xyXG4gICAgICAgICAgICAgICAgbmV3X3RvcG8gPSBbbmV3X3RvcG9dO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG5ld190b3BvLm1hcChmdW5jdGlvbih0KSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHQuZ2VvbWV0cnkubGVuZ3RoID09ICd1bmRlZmluZWQnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdC5nZW9tZXRyeSA9IFt0Lmdlb21ldHJ5XTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdC5pbmRleCA9PSAndW5kZWZpbmVkJykge1xyXG4gICAgICAgICAgICAgICAgICAgIG1hcC5sYXllcnMucHVzaCh0Lm5hbWUsIHQuZ2VvbWV0cnkpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbWFwLmxheWVycy5pbnNlcnQodC5pbmRleCwgdC5uYW1lLCB0Lmdlb21ldHJ5KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIG1hcC5kcmF3KCk7XHJcbiAgICAgICAgICAgIGlmIChvcHRpb25zLm9uZHJhdykgb3B0aW9ucy5vbmRyYXcoKTtcclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuXHJcbiAgICBpZiAoZGQuaXNBcnJheShzcGVjKSkge1xyXG4gICAgICAgIC8vIEFycmF5IGNhc2VcclxuICAgICAgICB2YXIgbmV3X3RvcG8gPSBkZC5tYXByZWR1Y2Uoc3BlYywgb3B0aW9ucy5tYXAsIG9wdGlvbnMucmVkdWNlKTtcclxuICAgICAgICBpZiAoIW9wdGlvbnMubGF5ZXJzKSB7XHJcbiAgICAgICAgICAgIG9wdGlvbnMubGF5ZXJzID0gJ2xheWVyLScgKyBsYXllcl9jb3VudGVyKys7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIG1hcC5sYXllcnMucHVzaChvcHRpb25zLmxheWVycywgbmV3X3RvcG8udmFsdWVzKCkpO1xyXG4gICAgICAgIC8vIGFkZCBkdW1teSBwcm9taXNlLCB3ZSBhcmUgbm90IGxvYWRpbmcgYW55dGhpbmdcclxuICAgICAgICB2YXIgcHJvbWlzZSA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xyXG4gICAgICAgICAgICByZXNvbHZlKG5ld190b3BvKTtcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLnByb21pc2VfZGF0YShwcm9taXNlKTtcclxuICAgICAgICAvLyBzZXQgdXAgcHJvamVjdGlvbiBmaXJzdCB0byBhdm9pZCByZXByb2plY3RpbmcgZ2VvbWV0cnlcclxuICAgICAgICBpZiAoIW1hcC5zZWxlY3RlZF9leHRlbnQpIHtcclxuICAgICAgICAgICAgbWFwLl9leHRlbnQobmV3X3RvcG8udmFsdWVzKCkpOyAgICAgICAgICAgXHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIFRPRE86IHdlIG5lZWQgYSBzbWFydGVyIHdheSBvZiBzZXR0aW5nIHVwIHByb2plY3Rpb24vYm91bmRpbmcgYm94IGluaXRpYWxseVxyXG4gICAgICAgIC8vIGlmIGV4dGVudCgpIHdhcyBjYWxsZWQsIHRoaXMgc2hvdWxkIGhhdmUgc2V0IHVwIGJvdW5kcywgZWxzZSB3ZSBuZWVkIHRvIGRvIGl0IGhlcmVcclxuICAgICAgICAvLyBob3dldmVyLCBleHRlbnQoKSBjdXJyZW50bHkgb3BlcmF0ZXMgb24gdGhlIHJlbmRlcmVkIDxwYXRoPnMgZ2VuZXJhdGVkIGJ5IGRyYXcoKVxyXG4gICAgICAgIC8vdGhpcy5fcHJvbWlzZS5nZW9tZXRyeS50aGVuKGRyYXcpO1xyXG4gICAgICAgIG1hcC5kcmF3KCk7XHJcbiAgICAgICAgaWYgKG9wdGlvbnMub25kcmF3KSBvcHRpb25zLm9uZHJhdygpO1xyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBwcm9taXNlID0gZGQubG9hZChzcGVjKTtcclxuXHJcbiAgICAvLyBjaGFpbiB0byBleGlzdGluZyBnZW9tZXRyeSBwcm9taXNlXHJcbiAgICBpZiAodGhpcy5fcHJvbWlzZS5nZW9tZXRyeSkge1xyXG4gICAgICAgIHZhciBwYXJlbnQgPSB0aGlzLl9wcm9taXNlLmdlb21ldHJ5O1xyXG4gICAgICAgIHRoaXMuX3Byb21pc2UuZ2VvbWV0cnkgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcclxuICAgICAgICAgICAgcGFyZW50LnRoZW4oZnVuY3Rpb24oXykge1xyXG4gICAgICAgICAgICAgICAgcHJvbWlzZS50aGVuKGZ1bmN0aW9uKGRhdGEpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGRhdGEpO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgZWxzZSB7XHJcbiAgICAgICAgdGhpcy5fcHJvbWlzZS5nZW9tZXRyeSA9IHByb21pc2U7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRoaXMuX3Byb21pc2UuZ2VvbWV0cnkudGhlbihmdW5jdGlvbihnZW9tKSB7XHJcbiAgICAgICAgaWYgKGdlb20udHlwZSAmJiBnZW9tLnR5cGUgPT0gJ1RvcG9sb2d5Jykge1xyXG4gICAgICAgICAgICAvLyBUb3BvSlNPTlxyXG4gICAgICAgICAgICB2YXIga2V5cyA9IG9wdGlvbnMubGF5ZXJzIHx8IE9iamVjdC5rZXlzKGdlb20ub2JqZWN0cyk7XHJcbiAgICAgICAgICAgIGtleXMubWFwKGZ1bmN0aW9uKGspIHtcclxuICAgICAgICAgICAgICAgIGlmIChnZW9tLm9iamVjdHNba10pIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgb2JqcyA9IHRvcG9qc29uLmZlYXR1cmUoZ2VvbSwgZ2VvbS5vYmplY3RzW2tdKS5mZWF0dXJlcztcclxuICAgICAgICAgICAgICAgICAgICBtYXAubGF5ZXJzLnB1c2goaywgb2Jqcyk7XHJcblx0XHRcdFx0XHQvLyBUT0RPOiBzdXBwb3J0IGZ1bmN0aW9ucyBmb3IgbWFwIGFzIHdlbGwgYXMgc3RyaW5nc1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLmtleSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpPTA7IGk8b2Jqcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIG9iaiA9IG9ianNbaV07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAob2JqLnByb3BlcnRpZXMgJiYgb2JqLnByb3BlcnRpZXNbb3B0aW9ucy5rZXldKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb2Jqc1tpXS5wcm9wZXJ0aWVzLl9fa2V5X18gPSBvYmoucHJvcGVydGllc1tvcHRpb25zLmtleV07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgLy8gR2VvSlNPTlxyXG4gICAgICAgICAgICBpZiAoIW9wdGlvbnMubGF5ZXJzKSB7XHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLmxheWVycyA9ICdsYXllci0nICsgbGF5ZXJfY291bnRlcisrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChnZW9tLmZlYXR1cmVzKSB7XHJcbiAgICAgICAgICAgICAgICBtYXAubGF5ZXJzLnB1c2gob3B0aW9ucy5sYXllcnMsIGdlb20uZmVhdHVyZXMpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgbWFwLmxheWVycy5wdXNoKG9wdGlvbnMubGF5ZXJzLCBbZ2VvbV0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIHNldCB1cCBwcm9qZWN0aW9uIGZpcnN0IHRvIGF2b2lkIHJlcHJvamVjdGluZyBnZW9tZXRyeVxyXG4gICAgICAgIGlmICghbWFwLnNlbGVjdGVkX2V4dGVudCkge1xyXG4gICAgICAgICAgICBtYXAuX2V4dGVudChnZW9tKTsgICAgICAgICAgIFxyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBUT0RPOiB3ZSBuZWVkIGEgc21hcnRlciB3YXkgb2Ygc2V0dGluZyB1cCBwcm9qZWN0aW9uL2JvdW5kaW5nIGJveCBpbml0aWFsbHlcclxuICAgICAgICAvLyBpZiBleHRlbnQoKSB3YXMgY2FsbGVkLCB0aGlzIHNob3VsZCBoYXZlIHNldCB1cCBib3VuZHMsIGVsc2Ugd2UgbmVlZCB0byBkbyBpdCBoZXJlXHJcbiAgICAgICAgLy8gaG93ZXZlciwgZXh0ZW50KCkgY3VycmVudGx5IG9wZXJhdGVzIG9uIHRoZSByZW5kZXJlZCA8cGF0aD5zIGdlbmVyYXRlZCBieSBkcmF3KClcclxuICAgICAgICAvL3RoaXMuX3Byb21pc2UuZ2VvbWV0cnkudGhlbihkcmF3KTtcclxuICAgICAgICBtYXAuZHJhdygpO1xyXG4gICAgICAgIGlmIChvcHRpb25zLm9uZHJhdykgb3B0aW9ucy5vbmRyYXcoKTtcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICAvLyBwdXQgaW50byBjaGFpbmVkIGRhdGEgcHJvbWlzZSB0byBtYWtlIHN1cmUgaXMgbG9hZGVkIGJlZm9yZSBsYXRlciBkYXRhXHJcbiAgICAvLyBub3RlIHRoaXMgaGFzIHRvIGhhcHBlbiBhZnRlciBtZXJnaW5nIGludG8gdGhpcy5fcHJvbWlzZS5nZW9tZXRyeSB0byBtYWtlXHJcbiAgICAvLyBzdXJlIGxheWVycyBhcmUgY3JlYXRlZCBmaXJzdCAoZS5nLiBmb3IgaGlnaGxpZ2h0aW5nKVxyXG4gICAgdGhpcy5wcm9taXNlX2RhdGEocHJvbWlzZSk7XHJcblxyXG4gICAgXHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbnZhciBpZGVudGlmeV9ieV9wcm9wZXJ0aWVzID0gZnVuY3Rpb24ocHJvcGVydGllcyl7XHJcbiAgICAvLyBUT0RPOiBjYWxsaW5nIHRoaXMgd2l0aG91dCBwcm9wZXJ0aWVzIHNob3VsZCB1c2UgcHJpbWFyeSBrZXkgYXMgcHJvcGVydHlcclxuICAgIC8vIGhvd2V2ZXIsIHRoaXMgaXMgbm90IHN0b3JlZCBpbiB0aGUgb2JqZWN0J3MgcHJvcGVydGllcyBjdXJyZW50bHlcclxuICAgIC8vIHNvIHRoZXJlIGlzIG5vIGVhc3kgd2F5IHRvIGFjY2VzcyBpdFxyXG4gICAgaWYgKCFwcm9wZXJ0aWVzKSB7XHJcbiAgICAgICAgcHJvcGVydGllcyA9ICdfX2tleV9fJztcclxuICAgIH1cclxuICAgIC8vIHNpbmdsZSBzdHJpbmcgY2FzZVxyXG4gICAgaWYgKHByb3BlcnRpZXMuc3Vic3RyKSB7XHJcbiAgICAgICAgcHJvcGVydGllcyA9IFtwcm9wZXJ0aWVzXTtcclxuICAgIH1cclxuICAgIHJldHVybiBmdW5jdGlvbihsYXllcnMsIG5hbWUpe1xyXG4gICAgICAgIG5hbWUgPSBuYW1lLnRvU3RyaW5nKCkudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICAvLyBsYXllcnMgaGF2ZSBwcmlvcml0eSwgc28gaXRlcmF0ZSB0aGVtIGZpcnN0XHJcbiAgICAgICAgdmFyIGx5ciA9IGxheWVycy5nZXQobmFtZSk7XHJcbiAgICAgICAgaWYgKGx5cikgcmV0dXJuIGx5cjtcclxuICAgICAgICB2YXIgcmVzdWx0ID0gW107XHJcbiAgICAgICAgLy8gcHJvcGVydGllcyBhcmUgb3JkZXJlZCBieSByZWxldmFuY2UsIHNvIGl0ZXJhdGUgdGhlc2UgZmlyc3RcclxuICAgICAgICBmb3IgKHZhciBrPTA7IGs8cHJvcGVydGllcy5sZW5ndGg7IGsrKykge1xyXG4gICAgICAgICAgICB2YXIgcHJvcGVydHkgPSBwcm9wZXJ0aWVzW2tdO1xyXG4gICAgICAgICAgICBmb3IgKHZhciBpPTA7IGk8bGF5ZXJzLmxlbmd0aCgpOyBpKyspIHtcclxuICAgICAgICAgICAgICAgIHZhciBrZXkgPSBsYXllcnMua2V5cygpW2ldLFxyXG4gICAgICAgICAgICAgICAgICAgIGdlb21zID0gbGF5ZXJzLmdldChrZXkpO1xyXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaj0wOyBqPGdlb21zLmxlbmd0aDsgaisrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIGdlb20gPSBnZW9tc1tqXTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZ2VvbS5wcm9wZXJ0aWVzICYmIGdlb20ucHJvcGVydGllc1twcm9wZXJ0eV0gIT09IHVuZGVmaW5lZCAmJiBnZW9tLnByb3BlcnRpZXNbcHJvcGVydHldLnRvU3RyaW5nKCkudG9Mb3dlckNhc2UoKSA9PSBuYW1lKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGdlb20pO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfTtcclxufTtcclxuXHJcbnZhciBpZGVudGlmeV9sYXllciA9IGZ1bmN0aW9uKGxheWVycywgbmFtZSkge1xyXG4gICAgbmFtZSA9IG5hbWUudG9Mb3dlckNhc2UoKTtcclxuICAgIHJldHVybiBsYXllcnMuZ2V0KG5hbWUpO1xyXG59O1xyXG5cclxuLy8gVE9ETzogdXNlIGFsbCBhcmd1bWVudHMgdG8gaWRlbnRpZnkgLSBjYW4gYmUgdXNlZCB0byBwcm92aWRlIG11bHRpcGxlIHByb3BlcnRpZXMgb3IgZnVuY3Rpb25zXHJcbm1hcG1hcC5wcm90b3R5cGUuaWRlbnRpZnkgPSBmdW5jdGlvbihzcGVjKSB7XHJcbiAgICBpZiAodHlwZW9mIHNwZWMgPT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIHRoaXMuaWRlbnRpZnlfZnVuYyA9IHNwZWM7XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcbiAgICAvLyBjYXN0IHRvIGFycmF5XHJcbiAgICBpZiAoIXNwZWMuc2xpY2UpIHtcclxuICAgICAgICBzcGVjID0gW3NwZWNdO1xyXG4gICAgfVxyXG4gICAgdGhpcy5pZGVudGlmeV9mdW5jID0gaWRlbnRpZnlfYnlfcHJvcGVydGllcyhzcGVjKTtcclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5zZWFyY2hBZGFwdGVyID0gZnVuY3Rpb24oc2VsZWN0aW9uLCBwcm9wTmFtZSkge1xyXG4gICAgdmFyIG1hcCA9IHRoaXM7XHJcbiAgICByZXR1cm4gZnVuY3Rpb24ocXVlcnksIGNhbGxiYWNrKSB7XHJcbiAgICAgICAgbWFwLnByb21pc2VfZGF0YSgpLnRoZW4oZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIHZhciBzZWwgPSBtYXAuZ2V0UmVwcmVzZW50YXRpb25zKHNlbGVjdGlvbiksXHJcbiAgICAgICAgICAgICAgICByZXN1bHRzID0gW107XHJcbiAgICAgICAgICAgIHNlbCA9IHNlbFswXTtcclxuICAgICAgICAgICAgZm9yICh2YXIgaT0wOyBpPHNlbC5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgdmFyIGQgPSBzZWxbaV0uX19kYXRhX18ucHJvcGVydGllcztcclxuICAgICAgICAgICAgICAgIGlmIChkW3Byb3BOYW1lXSAmJiBkW3Byb3BOYW1lXS50b0xvd2VyQ2FzZSgpLmluZGV4T2YocXVlcnkudG9Mb3dlckNhc2UoKSkgPT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdHMucHVzaChzZWxbaV0uX19kYXRhX18pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNhbGxiYWNrKHJlc3VsdHMpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfTtcclxufTtcclxuXHJcbi8vIFRPRE86IHRoaXMgaXMgbmVlZGVkIGZvciBzZWFyY2ggZnVuY3Rpb25hbGl0eSAoc2VlIHRvb2xzLmpzKSAtIGdlbmVyYWxpemUgYW5kIGludGVncmF0ZVxyXG4vLyBpbnRvIGlkZW50aWZ5KCkgZXRjLlxyXG5tYXBtYXAucHJvdG90eXBlLnNlYXJjaCA9IGZ1bmN0aW9uKHZhbHVlLCBrZXkpIHtcclxuICAgIGtleSA9IGtleSB8fCAnX19rZXlfXyc7XHJcbiAgICByZXR1cm4gaWRlbnRpZnlfYnlfcHJvcGVydGllcyhba2V5XSkodGhpcy5sYXllcnMsIHZhbHVlKTtcclxufTtcclxuXHJcbi8vIHJldHVybiB0aGUgcmVwcmVzZW50YXRpb24gKD0gU1ZHIGVsZW1lbnQpIG9mIGEgZ2l2ZW4gb2JqZWN0XHJcbm1hcG1hcC5wcm90b3R5cGUucmVwciA9IGZ1bmN0aW9uKGQpIHtcclxuICAgIHJldHVybiBkLl9fcmVwcl9fO1xyXG59O1xyXG5cclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuZHJhdyA9IGZ1bmN0aW9uKCkge1xyXG5cclxuICAgIHZhciBncm91cFNlbCA9IHRoaXMuX2VsZW1lbnRzLmdlb21ldHJ5XHJcbiAgICAgICAgLnNlbGVjdEFsbCgnZycpXHJcbiAgICAgICAgLmRhdGEodGhpcy5sYXllcnMua2V5cygpLCBmdW5jdGlvbihkLGkpIHsgcmV0dXJuIGQ7IH0pO1xyXG4gICAgXHJcbiAgICB2YXIgbWFwID0gdGhpcztcclxuICAgIFxyXG4gICAgdmFyIHBhdGhHZW5lcmF0b3IgPSBkMy5nZW8ucGF0aCgpLnByb2plY3Rpb24odGhpcy5fcHJvamVjdGlvbik7XHJcblxyXG4gICAgaWYgKHRoaXMuX2VsZW1lbnRzLnBsYWNlaG9sZGVyKSB7XHJcbiAgICAgICAgdGhpcy5fZWxlbWVudHMucGxhY2Vob2xkZXIucmVtb3ZlKCk7XHJcbiAgICAgICAgdGhpcy5fZWxlbWVudHMucGxhY2Vob2xkZXIgPSBudWxsO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBncm91cFNlbC5lbnRlcigpXHJcbiAgICAgICAgLmFwcGVuZCgnZycpXHJcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgZnVuY3Rpb24oZCl7XHJcbiAgICAgICAgICAgIHJldHVybiBkO1xyXG4gICAgICAgIH0pXHJcbiAgICAgICAgLmVhY2goZnVuY3Rpb24oZCkge1xyXG4gICAgICAgICAgICAvLyBkIGlzIG5hbWUgb2YgdG9wb2xvZ3kgb2JqZWN0XHJcbiAgICAgICAgICAgIHZhciBnZW9tID0gbWFwLmxheWVycy5nZXQoZCk7XHJcbiAgICAgICAgICAgIHZhciBnZW9tU2VsID0gZDMuc2VsZWN0KHRoaXMpXHJcbiAgICAgICAgICAgICAgICAuc2VsZWN0QWxsKCdwYXRoJylcclxuICAgICAgICAgICAgICAgIC5kYXRhKGdlb20pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgZ2VvbVNlbFxyXG4gICAgICAgICAgICAgICAgLmVudGVyKClcclxuICAgICAgICAgICAgICAgIC5hcHBlbmQoJ3BhdGgnKVxyXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2QnLCBwYXRoR2VuZXJhdG9yKVxyXG4gICAgICAgICAgICAgICAgLmF0dHIobWFwLnNldHRpbmdzLnBhdGhBdHRyaWJ1dGVzKVxyXG4gICAgICAgICAgICAgICAgLmVhY2goZnVuY3Rpb24oZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIGxpbmsgZGF0YSBvYmplY3QgdG8gaXRzIHJlcHJlc2VudGF0aW9uXHJcbiAgICAgICAgICAgICAgICAgICAgZC5fX3JlcHJfXyA9IHRoaXM7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgIFxyXG4gICAgZ3JvdXBTZWwub3JkZXIoKTtcclxufTtcclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuYW5jaG9yRnVuY3Rpb24gPSBmdW5jdGlvbihmKSB7XHJcbiAgICB0aGlzLmFuY2hvckYgPSBmO1xyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLmFuY2hvciA9IGZ1bmN0aW9uKGQpIHtcclxuICAgIGlmICh0aGlzLmFuY2hvckYpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5hbmNob3JGKGQpO1xyXG4gICAgfVxyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5zaXplID0gZnVuY3Rpb24oKSB7XHJcbiAgICAvLyBUT0RPOlxyXG4gICAgLy8gb3VyIHZpZXdCb3ggaXMgc2V0IHVwIGZvciBhbiBleHRlbnQgb2YgODAweDQwMCB1bml0c1xyXG4gICAgLy8gc2hvdWxkIHdlIGNoYW5nZSB0aGlzP1xyXG5cclxuICAgIC8vIGJvdW5kcyBhcmUgcmUtY2FsY3VsYXRlIGJ5IGluaXRFdmVudHMgb24gZXZlcnkgcmVzaXplXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHdpZHRoOiB0aGlzLndpZHRoLFxyXG4gICAgICAgIGhlaWdodDogdGhpcy5oZWlnaHRcclxuICAgIH07XHJcbn07XHJcblxyXG5cclxubWFwbWFwLnByb3RvdHlwZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QgPSBmdW5jdGlvbigpIHtcclxuICAgIC8vIGJhc2ljYWxseSByZXR1cm5zIGdldEJvdW5kaW5nQ2xpZW50UmVjdCgpIGZvciBtYWluIFNWRyBlbGVtZW50XHJcbiAgICAvLyBGaXJlZm94IDwgMzUgd2lsbCByZXBvcnQgd3JvbmcgQm91bmRpbmdDbGllbnRSZWN0IChhZGRpbmcgY2xpcHBlZCBiYWNrZ3JvdW5kKSxcclxuICAgIC8vIHNvIHdlIGhhdmUgdG8gZml4IGl0XHJcbiAgICAvLyBodHRwczovL2J1Z3ppbGxhLm1vemlsbGEub3JnL3Nob3dfYnVnLmNnaT9pZD01MzA5ODVcclxuICAgIC8vIGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvMjM2ODQ4MjEvY2FsY3VsYXRlLXNpemUtb2Ytc3ZnLWVsZW1lbnQtaW4taHRtbC1wYWdlXHJcbiAgICB2YXIgZWwgPSB0aGlzLl9lbGVtZW50cy5tYWluLm5vZGUoKSxcclxuICAgICAgICBib3VuZHMgPSBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSxcclxuICAgICAgICBjcyA9IGdldENvbXB1dGVkU3R5bGUoZWwpLFxyXG4gICAgICAgIHBhcmVudE9mZnNldCA9ICQoZWwucGFyZW50Tm9kZSkub2Zmc2V0KCksXHJcbiAgICAgICAgbGVmdCA9IHBhcmVudE9mZnNldC5sZWZ0O1xyXG4gICAgLy8gVE9ETzogdGFrZSBpbnRvIGFjY291bnQgbWFyZ2lucyBldGMuXHJcbiAgICBpZiAoY3MubGVmdC5pbmRleE9mKCdweCcpID4gLTEpIHtcclxuICAgICAgICBsZWZ0ICs9IHBhcnNlSW50KGNzLmxlZnQuc2xpY2UoMCwtMikpO1xyXG4gICAgfVxyXG4gICAgLy8gdGhpcyB0ZXN0cyBnZXRCb3VuZGluZ0NsaWVudFJlY3QoKSB0byBiZSBub24tYnVnZ3lcclxuICAgIGlmIChib3VuZHMubGVmdCA9PSBsZWZ0KSB7XHJcbiAgICAgICAgcmV0dXJuIGJvdW5kcztcclxuICAgIH1cclxuICAgIC8vIGNvbnN0cnVjdCBzeW50aGV0aWMgYm91bmRpbmdib3ggZnJvbSBjb21wdXRlZCBzdHlsZVxyXG4gICAgdmFyIHRvcCA9IHBhcmVudE9mZnNldC50b3AsXHJcbiAgICAgICAgd2lkdGggPSBwYXJzZUludChjcy53aWR0aC5zbGljZSgwLC0yKSksXHJcbiAgICAgICAgaGVpZ2h0ID0gcGFyc2VJbnQoY3MuaGVpZ2h0LnNsaWNlKDAsLTIpKTtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgbGVmdDogbGVmdCxcclxuICAgICAgICB0b3A6IHRvcCxcclxuICAgICAgICB3aWR0aDogd2lkdGgsXHJcbiAgICAgICAgaGVpZ2h0OiBoZWlnaHQsXHJcbiAgICAgICAgcmlnaHQ6IGxlZnQgKyB3aWR0aCxcclxuICAgICAgICBib3R0b206IHRvcCArIGhlaWdodFxyXG4gICAgfTtcclxufTtcclxuXHJcbi8vIFRPRE86IGRpc2FibGUgcG9pbnRlci1ldmVudHMgZm9yIG5vdCBzZWxlY3RlZCBwYXRoc1xyXG5tYXBtYXAucHJvdG90eXBlLnNlbGVjdCA9IGZ1bmN0aW9uKHNlbGVjdGlvbikge1xyXG5cclxuICAgIHZhciBtYXAgPSB0aGlzO1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXROYW1lKHNlbCkge1xyXG4gICAgICAgIHJldHVybiAodHlwZW9mIHNlbCA9PSAnc3RyaW5nJykgPyBzZWwgOiAoc2VsLnNlbGVjdGlvbk5hbWUgfHwgJ2Z1bmN0aW9uJyk7XHJcbiAgICB9XHJcbiAgICB2YXIgb2xkU2VsID0gdGhpcy5zZWxlY3RlZDtcclxuICAgIGlmICh0aGlzLnNlbGVjdGVkKSB7XHJcbiAgICAgICAgdGhpcy5fZWxlbWVudHMubWFpbi5jbGFzc2VkKCdzZWxlY3RlZC0nICsgZ2V0TmFtZSh0aGlzLnNlbGVjdGVkKSwgZmFsc2UpO1xyXG4gICAgfVxyXG4gICAgdGhpcy5zZWxlY3RlZCA9IHNlbGVjdGlvbjtcclxuICAgIGlmICh0aGlzLnNlbGVjdGVkKSB7XHJcbiAgICAgICAgdGhpcy5fZWxlbWVudHMubWFpbi5jbGFzc2VkKCdzZWxlY3RlZC0nICsgZ2V0TmFtZSh0aGlzLnNlbGVjdGVkKSwgdHJ1ZSk7XHJcbiAgICB9XHJcbiAgICB0aGlzLnByb21pc2VfZGF0YSgpLnRoZW4oZnVuY3Rpb24oKXtcclxuICAgICAgICBpZiAob2xkU2VsKSB7XHJcbiAgICAgICAgICAgIG1hcC5nZXRSZXByZXNlbnRhdGlvbnMob2xkU2VsKS5jbGFzc2VkKCdzZWxlY3RlZCcsZmFsc2UpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoc2VsZWN0aW9uKSB7XHJcbiAgICAgICAgICAgIG1hcC5nZXRSZXByZXNlbnRhdGlvbnMoc2VsZWN0aW9uKS5jbGFzc2VkKCdzZWxlY3RlZCcsdHJ1ZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuaGlnaGxpZ2h0ID0gZnVuY3Rpb24oc2VsZWN0aW9uKSB7XHJcblxyXG4gICAgdmFyIG1hcCA9IHRoaXM7XHJcbiAgICBcclxuICAgIFxyXG4gICAgaWYgKHNlbGVjdGlvbiA9PT0gbnVsbCkge1xyXG4gICAgICAgIG1hcC5fZWxlbWVudHMuc2hhZG93RWwuc2VsZWN0QWxsKCdwYXRoJykucmVtb3ZlKCk7XHJcbiAgICAgICAgbWFwLl9lbGVtZW50cy5zaGFkb3dDcm9wRWwuc2VsZWN0QWxsKCdwYXRoJykucmVtb3ZlKCk7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgICB0aGlzLnByb21pc2VfZGF0YSgpLnRoZW4oZnVuY3Rpb24oZGF0YSkgeyAgICAgIFxyXG4gICAgICAgICAgICB2YXIgb2JqID0gbWFwLmdldFJlcHJlc2VudGF0aW9ucyhzZWxlY3Rpb24pO1xyXG4gICAgICAgICAgICBtYXAuX2VsZW1lbnRzLnNoYWRvd0VsLnNlbGVjdEFsbCgncGF0aCcpLnJlbW92ZSgpO1xyXG4gICAgICAgICAgICBtYXAuX2VsZW1lbnRzLnNoYWRvd0Nyb3BFbC5zZWxlY3RBbGwoJ3BhdGgnKS5yZW1vdmUoKTtcclxuICAgICAgICAgICAgb2JqLmVhY2goZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICBtYXAuX2VsZW1lbnRzLnNoYWRvd0VsLmFwcGVuZCgncGF0aCcpXHJcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBkOiB0aGlzLmF0dHJpYnV0ZXMuZC52YWx1ZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmlsbDogJ3JnYmEoMCwwLDAsMC41KScgLy8nIzk5OSdcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIG1hcC5fZWxlbWVudHMuc2hhZG93Q3JvcEVsLmFwcGVuZCgncGF0aCcpXHJcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBkOiB0aGlzLmF0dHJpYnV0ZXMuZC52YWx1ZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmlsbDogJyNmZmYnXHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG4vKlxyXG5DYWxsIHdpdGhvdXQgcGFyYW1ldGVycyB0byBnZXQgY3VycmVudCBzZWxlY3Rpb24uXHJcbkNhbGwgd2l0aCBudWxsIHRvIGdldCBhbGwgdG9wb2xvZ3kgb2JqZWN0cy5cclxuQ2FsbCB3aXRoIGZ1bmN0aW9uIHRvIGZpbHRlciBnZW9tZXRyaWVzLlxyXG5DYWxsIHdpdGggc3RyaW5nIHRvIGZpbHRlciBnZW9tZXRyaWVzL2xheWVycyBiYXNlZCBvbiBpZGVudGlmeSgpLlxyXG5DYWxsIHdpdGggZ2VvbWV0cnkgdG8gY29udmVydCBpbnRvIGQzIHNlbGVjdGlvbi5cclxuXHJcblJldHVybnMgYSBEMyBzZWxlY3Rpb24uXHJcbiovXHJcbm1hcG1hcC5wcm90b3R5cGUuZ2V0UmVwcmVzZW50YXRpb25zID0gZnVuY3Rpb24oc2VsZWN0aW9uKSB7XHJcbiAgICBpZiAodHlwZW9mIHNlbGVjdGlvbiA9PSAndW5kZWZpbmVkJykge1xyXG4gICAgICAgIHNlbGVjdGlvbiA9IHRoaXMuc2VsZWN0ZWQ7XHJcbiAgICB9XHJcbiAgICBpZiAoc2VsZWN0aW9uKSB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiBzZWxlY3Rpb24gPT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fZWxlbWVudHMuZ2VvbWV0cnkuc2VsZWN0QWxsKCdwYXRoJykuZmlsdGVyKGZ1bmN0aW9uKGQsaSl7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gc2VsZWN0aW9uKGQucHJvcGVydGllcyk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoc2VsZWN0aW9uLl9fZGF0YV9fKSB7XHJcbiAgICAgICAgICAgIC8vIGlzIGEgZ2VvbWV0cnkgZ2VuZXJhdGVkIGJ5IGQzIC0+IHJldHVybiBzZWxlY3Rpb25cclxuICAgICAgICAgICAgcmV0dXJuIGQzLnNlbGVjdChzZWxlY3Rpb24pO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBUT0RPOiB0aGlzIHNob3VsZCBoYXZlIGEgbmljZXIgQVBJXHJcbiAgICAgICAgdmFyIG9iaiA9IHRoaXMuaWRlbnRpZnlfZnVuYyh0aGlzLmxheWVycywgc2VsZWN0aW9uKTtcclxuICAgICAgICBpZiAoIW9iaikgcmV0dXJuIGQzLnNlbGVjdChudWxsKTtcclxuICAgICAgICAvLyBsYXllciBjYXNlXHJcbiAgICAgICAgaWYgKG9iai5sZW5ndGgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGQzLnNlbGVjdEFsbChvYmoubWFwKGZ1bmN0aW9uKGQpe3JldHVybiBkLl9fcmVwcl9fO30pKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gb2JqZWN0IGNhc2VcclxuICAgICAgICByZXR1cm4gZDMuc2VsZWN0KG9iai5fX3JlcHJfXyk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcy5fZWxlbWVudHMuZ2VvbWV0cnkuc2VsZWN0QWxsKCdwYXRoJyk7XHJcbn07XHJcblxyXG4vLyBUT0RPOiB0aGlzIGlzIGFuIHVnbHkgaGFjayBmb3Igbm93LCB1bnRpbCB3ZSBwcm9wZXJseSBrZWVwIHRyYWNrIG9mIGN1cnJlbnQgbWVyZ2VkIGRhdGEhXHJcbm1hcG1hcC5wcm90b3R5cGUuZ2V0RGF0YSA9IGZ1bmN0aW9uKGtleSwgc2VsZWN0aW9uKSB7XHJcblxyXG4gICAgdmFyIG1hcCA9IHRoaXM7XHJcbiAgICBcclxuICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcclxuICAgICAgICBtYXAuX3Byb21pc2UuZGF0YS50aGVuKGZ1bmN0aW9uKGRhdGEpIHtcclxuICAgICAgICBcclxuICAgICAgICAgICAgZGF0YSA9IGRkLk9yZGVyZWRIYXNoKCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBtYXAuZ2V0UmVwcmVzZW50YXRpb25zKHNlbGVjdGlvbilbMF0uZm9yRWFjaChmdW5jdGlvbihkKXtcclxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgZC5fX2RhdGFfXy5wcm9wZXJ0aWVzW2tleV0gIT0gJ3VuZGVmaW5lZCcpIHtcclxuICAgICAgICAgICAgICAgICAgICBkYXRhLnB1c2goZC5fX2RhdGFfXy5wcm9wZXJ0aWVzW2tleV0sIGQuX19kYXRhX18ucHJvcGVydGllcyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmVzb2x2ZShkYXRhKTtcclxuICAgICAgICB9KTtcclxuICAgIH0pO1xyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5nZXRPdmVybGF5Q29udGV4dCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHRoaXMuX2VsZW1lbnRzLm92ZXJsYXk7XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLnByb2plY3QgPSBmdW5jdGlvbihwb2ludCkge1xyXG4gICAgcmV0dXJuIHRoaXMuX3Byb2plY3Rpb24ocG9pbnQpO1xyXG59O1xyXG5cclxuXHJcbm1hcG1hcC5wcm90b3R5cGUucHJvbWlzZV9kYXRhID0gZnVuY3Rpb24ocHJvbWlzZSkge1xyXG4gICAgLy8gY2hhaW4gYSBuZXcgcHJvbWlzZSB0byB0aGUgZGF0YSBwcm9taXNlXHJcbiAgICAvLyB0aGlzIGFsbG93cyBhIG1vcmUgZWxlZ2FudCBBUEkgdGhhbiBQcm9taXNlLmFsbChbcHJvbWlzZXNdKVxyXG4gICAgLy8gc2luY2Ugd2UgdXNlIG9ubHkgYSBzaW5nbGUgcHJvbWlzZSB0aGUgXCJlbmNhcHN1bGF0ZXNcIiB0aGVcclxuICAgIC8vIHByZXZpb3VzIG9uZXNcclxuICAgIFxyXG4gICAgLy8gVE9ETzogaGlkZSB0aGlzLl9wcm9taXNlLmRhdGEgdGhyb3VnaCBhIGNsb3N1cmU/XHJcbiAgICBcclxuICAgIC8vIFRPRE86IHdlIG9ubHkgZnVsZmlsbCB3aXRoIG1vc3QgcmVjZW50IGRhdGEgLSBzaG91bGRcclxuICAgIC8vIHdlIG5vdCAqYWx3YXlzKiBmdWxmaWxsIHdpdGggY2Fub25pY2FsIGRhdGEgaS5lLiB0aGVcclxuICAgIC8vIHVuZGVybHlpbmcgc2VsZWN0aW9uLCBvciBrZWVwIGNhbm9uaWNhbCBkYXRhIGFuZCByZWZyZXNoXHJcbiAgICAvLyBzZWxlY3Rpb24gYWx3YXlzP1xyXG5cclxuICAgIHZhciBtYXAgPSB0aGlzO1xyXG4gICAgXHJcbiAgICBpZiAocHJvbWlzZSkge1xyXG4gICAgICAgIGlmICh0aGlzLl9wcm9taXNlLmRhdGEpIHtcclxuICAgICAgICAgICAgdGhpcy5fcHJvbWlzZS5kYXRhID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XHJcbiAgICAgICAgICAgICAgICBtYXAuX3Byb21pc2UuZGF0YS50aGVuKGZ1bmN0aW9uKF8pIHtcclxuICAgICAgICAgICAgICAgICAgICBwcm9taXNlLnRoZW4oZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGRhdGEpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5fcHJvbWlzZS5kYXRhID0gcHJvbWlzZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcy5fcHJvbWlzZS5kYXRhOyAgIFxyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS50aGVuID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcclxuICAgIHRoaXMucHJvbWlzZV9kYXRhKCkudGhlbihjYWxsYmFjayk7XHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuZGF0YSA9IGZ1bmN0aW9uKHNwZWMsIGtleU9yT3B0aW9ucykge1xyXG5cclxuICAgIHZhciBvcHRpb25zID0gZGQuaXNEaWN0aW9uYXJ5KGtleU9yT3B0aW9ucykgPyBrZXlPck9wdGlvbnMgOiB7bWFwOiBrZXlPck9wdGlvbnN9O1xyXG4gICAgXHJcbiAgICBvcHRpb25zID0gZGQubWVyZ2Uoe1xyXG4gICAgICAgIGdlb21ldHJ5S2V5OiAnX19rZXlfXycgLy8gbmF0dXJhbCBrZXlcclxuICAgICAgICAvLyBtYXA6IGRhdGRhdGEgZGVmYXVsdFxyXG4gICAgICAgIC8vIHJlZHVjZTogZGF0ZGF0YSBkZWZhdWx0XHJcbiAgICB9LCBvcHRpb25zKTtcclxuICAgICAgICBcclxuICAgIHZhciBtYXAgPSB0aGlzO1xyXG4gICAgXHJcbiAgICBpZiAodHlwZW9mIHNwZWMgPT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIHRoaXMucHJvbWlzZV9kYXRhKCkudGhlbihmdW5jdGlvbihkYXRhKXtcclxuICAgICAgICAgICAgLy8gVE9ETzogdGhpcyBpcyBhIG1lc3MsIHNlZSBhYm92ZSAtIGRhdGFcclxuICAgICAgICAgICAgLy8gZG9lc24ndCBjb250YWluIHRoZSBhY3R1YWwgY2Fub25pY2FsIGRhdGEsIGJ1dCBcclxuICAgICAgICAgICAgLy8gb25seSB0aGUgbW9zdCByZWNlbnRseSByZXF1ZXN0ZWQgb25lLCB3aGljaCBkb2Vzbid0XHJcbiAgICAgICAgICAgIC8vIGhlbHAgdXMgZm9yIHRyYW5zZm9ybWF0aW9uc1xyXG4gICAgICAgICAgICBtYXAuX2VsZW1lbnRzLmdlb21ldHJ5LnNlbGVjdEFsbCgncGF0aCcpXHJcbiAgICAgICAgICAgIC5lYWNoKGZ1bmN0aW9uKGdlb20pIHtcclxuICAgICAgICAgICAgICAgIGlmIChnZW9tLnByb3BlcnRpZXMpIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgdmFsID0gc3BlYyhnZW9tLnByb3BlcnRpZXMpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWwpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbWFwbWFwLmV4dGVuZChnZW9tLnByb3BlcnRpZXMsIHZhbCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICAgIHRoaXMucHJvbWlzZV9kYXRhKGRkKHNwZWMsIG9wdGlvbnMubWFwLCBvcHRpb25zLnJlZHVjZSwgb3B0aW9ucykpXHJcbiAgICAgICAgLnRoZW4oZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgICAgICAgICBtYXAuX2VsZW1lbnRzLmdlb21ldHJ5LnNlbGVjdEFsbCgncGF0aCcpXHJcbiAgICAgICAgICAgICAgICAuZWFjaChmdW5jdGlvbihkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGQucHJvcGVydGllcykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgayA9IGQucHJvcGVydGllc1tvcHRpb25zLmdlb21ldHJ5S2V5XTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGspIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1hcG1hcC5leHRlbmQoZC5wcm9wZXJ0aWVzLCBkYXRhLmdldChrKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvL2NvbnNvbGUud2FybihcIk5vICdcIiArIGdlb21ldHJ5S2V5ICsgXCInIHZhbHVlIHByZXNlbnQgZm9yIFwiICsgdGhpcyArIFwiIVwiKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSAgICBcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxudmFyIE1ldGFEYXRhU3BlYyA9IGZ1bmN0aW9uKGtleSwgZmllbGRzKSB7XHJcbiAgICAvLyBlbnN1cmUgY29uc3RydWN0b3IgaW52b2NhdGlvblxyXG4gICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIE1ldGFEYXRhU3BlYykpIHJldHVybiBuZXcgTWV0YURhdGFTcGVjKGtleSwgZmllbGRzKTtcclxuICAgIG1hcG1hcC5leHRlbmQodGhpcywgZmllbGRzKTtcclxuICAgIHRoaXMua2V5ID0ga2V5O1xyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcbk1ldGFEYXRhU3BlYy5wcm90b3R5cGUuc3BlY2lmaWNpdHkgPSBmdW5jdGlvbigpIHtcclxuICAgIC8vIHJlZ2V4IGNhc2UuIHVzZSBsZW5ndGggb2Ygc3RyaW5nIHJlcHJlc2VudGF0aW9uIHdpdGhvdXQgZW5jbG9zaW5nIC8uLi4vXHJcbiAgICBpZiAodGhpcy5rZXkgaW5zdGFuY2VvZiBSZWdFeHApIHJldHVybiB0aGlzLmtleS50b1N0cmluZygpLTI7XHJcbiAgICAvLyByZXR1cm4gbnVtYmVyIG9mIHNpZ25pZmljYW50IGxldHRlcnNcclxuICAgIHJldHVybiB0aGlzLmtleS5sZW5ndGggLSAodGhpcy5rZXkubWF0Y2goL1tcXCpcXD9dL2cpIHx8IFtdKS5sZW5ndGg7XHJcbn07XHJcbk1ldGFEYXRhU3BlYy5wcm90b3R5cGUubWF0Y2ggPSBmdW5jdGlvbihzdHIpIHtcclxuICAgIGlmICh0aGlzLmtleSBpbnN0YW5jZW9mIFJlZ0V4cCkgcmV0dXJuIChzdHIuc2VhcmNoKHRoaXMua2V5KSA9PSAwKTtcclxuICAgIHZhciByZXggPSBuZXcgUmVnRXhwKCdeJyArIHRoaXMua2V5LnJlcGxhY2UoJyonLCcuKicpLnJlcGxhY2UoJz8nLCcuJykpO1xyXG4gICAgcmV0dXJuIChzdHIuc2VhcmNoKHJleCkgPT0gMCk7XHJcbn07XHJcbnZhciBNZXRhRGF0YSA9IGZ1bmN0aW9uKGZpZWxkcywgbG9jYWxlUHJvdmlkZXIpIHtcclxuICAgIC8vIGVuc3VyZSBjb25zdHJ1Y3RvciBpbnZvY2F0aW9uXHJcbiAgICBpZiAoISh0aGlzIGluc3RhbmNlb2YgTWV0YURhdGEpKSByZXR1cm4gbmV3IE1ldGFEYXRhKGZpZWxkcywgbG9jYWxlUHJvdmlkZXIpO1xyXG4gICAgbWFwbWFwLmV4dGVuZCh0aGlzLCBmaWVsZHMpO1xyXG4gICAgdGhpcy5mb3JtYXQgPSBmdW5jdGlvbih2YWwpIHtcclxuICAgICAgICBpZiAoIXRoaXMuX2Zvcm1hdCkge1xyXG4gICAgICAgICAgICB0aGlzLl9mb3JtYXQgPSB0aGlzLmdldEZvcm1hdHRlcigpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoKHRoaXMubnVtYmVyRm9ybWF0ICYmIChpc05hTih2YWwpIHx8IHZhbCA9PT0gdW5kZWZpbmVkIHx8IHZhbCA9PT0gbnVsbCkpIHx8ICghdGhpcy5udW1iZXJGb3JtYXQgJiYgIXZhbCkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMudW5kZWZpbmVkVmFsdWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB0aGlzLl9mb3JtYXQodmFsKTtcclxuICAgIH07XHJcbiAgICB0aGlzLmdldEZvcm1hdHRlciA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGlmICh0aGlzLnNjYWxlID09ICdvcmRpbmFsJyAmJiB0aGlzLnZhbHVlTGFiZWxzKSB7XHJcbiAgICAgICAgICAgIHZhciBzY2FsZSA9IGQzLnNjYWxlLm9yZGluYWwoKS5kb21haW4odGhpcy5kb21haW4pLnJhbmdlKHRoaXMudmFsdWVMYWJlbHMpO1xyXG4gICAgICAgICAgICByZXR1cm4gc2NhbGU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLm51bWJlckZvcm1hdCAmJiB0eXBlb2YgdGhpcy5udW1iZXJGb3JtYXQgPT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5udW1iZXJGb3JtYXQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChsb2NhbGVQcm92aWRlci5sb2NhbGUpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGxvY2FsZVByb3ZpZGVyLmxvY2FsZS5udW1iZXJGb3JtYXQodGhpcy5udW1iZXJGb3JtYXQgfHwgJy4wMWYnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGQzLmZvcm1hdCh0aGlzLm51bWJlckZvcm1hdCB8fCAnLjAxZicpO1xyXG4gICAgfTtcclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5tZXRhID0gZnVuY3Rpb24obWV0YWRhdGEpe1xyXG4gICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhtZXRhZGF0YSk7XHJcbiAgICBmb3IgKHZhciBpPTA7IGk8a2V5cy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIHRoaXMubWV0YWRhdGFfc3BlY3MucHVzaChNZXRhRGF0YVNwZWMoa2V5c1tpXSwgbWV0YWRhdGFba2V5c1tpXV0pKTtcclxuICAgIH1cclxuICAgIHRoaXMubWV0YWRhdGFfc3BlY3Muc29ydChmdW5jdGlvbihhLGIpIHtcclxuICAgICAgICByZXR1cm4gYS5zcGVjaWZpY2l0eSgpLWIuc3BlY2lmaWNpdHkoKTtcclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLmdldE1ldGFkYXRhID0gZnVuY3Rpb24oa2V5KSB7XHJcbiAgICBpZiAoIXRoaXMubWV0YWRhdGEpIHtcclxuICAgICAgICB0aGlzLm1ldGFkYXRhID0ge307XHJcbiAgICB9XHJcbiAgICBpZiAoIXRoaXMubWV0YWRhdGFba2V5XSkge1xyXG4gICAgICAgIHZhciBmaWVsZHMgPSBtYXBtYXAuZXh0ZW5kKHt9LCB0aGlzLnNldHRpbmdzLmRlZmF1bHRNZXRhZGF0YSk7XHJcbiAgICAgICAgZm9yICh2YXIgaT0wOyBpPHRoaXMubWV0YWRhdGFfc3BlY3MubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMubWV0YWRhdGFfc3BlY3NbaV0ubWF0Y2goa2V5KSkge1xyXG4gICAgICAgICAgICAgICAgbWFwbWFwLmV4dGVuZChmaWVsZHMsIHRoaXMubWV0YWRhdGFfc3BlY3NbaV0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMubWV0YWRhdGFba2V5XSA9IE1ldGFEYXRhKGZpZWxkcywgdGhpcyk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcy5tZXRhZGF0YVtrZXldO1xyXG59O1xyXG5cclxuZnVuY3Rpb24gZ2V0U3RhdHMoZGF0YSwgdmFsdWVGdW5jKSB7XHJcbiAgICB2YXIgc3RhdHMgPSB7XHJcbiAgICAgICAgY291bnQ6IDAsXHJcbiAgICAgICAgY291bnROdW1iZXJzOiAwLFxyXG4gICAgICAgIGFueU5lZ2F0aXZlOiBmYWxzZSxcclxuICAgICAgICBhbnlQb3NpdGl2ZTogZmFsc2UsXHJcbiAgICAgICAgYW55U3RyaW5nczogZmFsc2UsXHJcbiAgICAgICAgbWluOiB1bmRlZmluZWQsXHJcbiAgICAgICAgbWF4OiB1bmRlZmluZWRcclxuICAgIH07XHJcbiAgICBmdW5jdGlvbiBkYXR1bUZ1bmMoZCkge1xyXG4gICAgICAgIHZhciB2YWwgPSB2YWx1ZUZ1bmMoZCk7XHJcbiAgICAgICAgaWYgKHZhbCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHN0YXRzLmNvdW50ICs9IDE7XHJcbiAgICAgICAgICAgIGlmICghaXNOYU4oK3ZhbCkpIHtcclxuICAgICAgICAgICAgICAgIHN0YXRzLmNvdW50TnVtYmVycyArPSAxO1xyXG4gICAgICAgICAgICAgICAgaWYgKHN0YXRzLm1pbiA9PT0gdW5kZWZpbmVkKSBzdGF0cy5taW4gPSB2YWw7XHJcbiAgICAgICAgICAgICAgICBpZiAoc3RhdHMubWF4ID09PSB1bmRlZmluZWQpIHN0YXRzLm1heCA9IHZhbDtcclxuICAgICAgICAgICAgICAgIGlmICh2YWwgPCBzdGF0cy5taW4pIHN0YXRzLm1pbiA9IHZhbDtcclxuICAgICAgICAgICAgICAgIGlmICh2YWwgPiBzdGF0cy5tYXgpIHN0YXRzLm1heCA9IHZhbDtcclxuICAgICAgICAgICAgICAgIGlmICh2YWwgPiAwKSBzdGF0cy5hbnlQb3NpdGl2ZSA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICBpZiAodmFsIDwgMCkgc3RhdHMuYW55TmVnYXRpdmUgPSB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChpc05hTigrdmFsKSAmJiB2YWwpIHN0YXRzLmFueVN0cmluZyA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgaWYgKGRhdGEuZWFjaCAmJiB0eXBlb2YgZGF0YS5lYWNoID09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICBkYXRhLmVhY2goZGF0dW1GdW5jKTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICAgIGZvciAodmFyIGk9MDsgaTxkYXRhLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGRhdHVtRnVuYyhkYXRhW2ldKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gc3RhdHM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHByb3BlcnRpZXNfYWNjZXNzb3IoZnVuYykge1xyXG4gICAgLy8gY29udmVydHMgYSBkYXRhIGNhbGxiYWNrIGZ1bmN0aW9uIHRvIGFjY2VzcyBkYXRhJ3MgLnByb3BlcnRpZXMgZW50cnlcclxuICAgIC8vIHVzZWZ1bCBmb3IgcHJvY2Vzc2luZyBnZW9qc29uIG9iamVjdHNcclxuICAgIHJldHVybiBmdW5jdGlvbihkYXRhKSB7XHJcbiAgICAgICAgaWYgKGRhdGEucHJvcGVydGllcykgcmV0dXJuIGZ1bmMoZGF0YS5wcm9wZXJ0aWVzKTtcclxuICAgIH07XHJcbn1cclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuYXV0b0NvbG9yU2NhbGUgPSBmdW5jdGlvbih2YWx1ZSwgbWV0YWRhdGEpIHtcclxuICAgIFxyXG4gICAgaWYgKCFtZXRhZGF0YSkge1xyXG4gICAgICAgIG1ldGFkYXRhID0gdGhpcy5nZXRNZXRhZGF0YSh2YWx1ZSk7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgICBtZXRhZGF0YSA9IGRkLm1lcmdlKHRoaXMuc2V0dGluZ3MuZGVmYXVsdE1ldGFkYXRhLCBtZXRhZGF0YSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghbWV0YWRhdGEuZG9tYWluKSB7XHJcbiAgICAgICAgdmFyIHN0YXRzID0gZ2V0U3RhdHModGhpcy5fZWxlbWVudHMuZ2VvbWV0cnkuc2VsZWN0QWxsKCdwYXRoJyksIHByb3BlcnRpZXNfYWNjZXNzb3Ioa2V5T3JDYWxsYmFjayh2YWx1ZSkpKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoc3RhdHMuYW55TmVnYXRpdmUgJiYgc3RhdHMuYW55UG9zaXRpdmUpIHtcclxuICAgICAgICAgICAgLy8gbWFrZSBzeW1tZXRyaWNhbFxyXG4gICAgICAgICAgICBtZXRhZGF0YS5kb21haW4gPSBbTWF0aC5taW4oc3RhdHMubWluLCAtc3RhdHMubWF4KSwgTWF0aC5tYXgoc3RhdHMubWF4LCAtc3RhdHMubWluKV07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICBtZXRhZGF0YS5kb21haW4gPSBbc3RhdHMubWluLHN0YXRzLm1heF07XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgLy8gc3VwcG9ydCBkMyBzY2FsZXMgb3V0IG9mIHRoZSBib3hcclxuICAgIHZhciBzY2FsZSA9IGQzLnNjYWxlW21ldGFkYXRhLnNjYWxlXSgpO1xyXG4gICAgc2NhbGUuZG9tYWluKG1ldGFkYXRhLmRvbWFpbikucmFuZ2UobWV0YWRhdGEuY29sb3IgfHwgbWV0YWRhdGEuY29sb3JzKVxyXG4gICAgXHJcbiAgICByZXR1cm4gc2NhbGU7ICAgIFxyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5hdXRvTGluZWFyU2NhbGUgPSBmdW5jdGlvbih2YWx1ZUZ1bmMpIHsgICAgXHJcbiAgICB2YXIgc3RhdHMgPSBnZXRTdGF0cyh0aGlzLl9lbGVtZW50cy5nZW9tZXRyeS5zZWxlY3RBbGwoJ3BhdGgnKSwgcHJvcGVydGllc19hY2Nlc3Nvcih2YWx1ZUZ1bmMpKTsgICAgXHJcbiAgICByZXR1cm4gZDMuc2NhbGUubGluZWFyKClcclxuICAgICAgICAuZG9tYWluKFswLHN0YXRzLm1heF0pOyAgICBcclxufTtcclxubWFwbWFwLnByb3RvdHlwZS5hdXRvU3FydFNjYWxlID0gZnVuY3Rpb24odmFsdWVGdW5jKSB7ICAgIFxyXG4gICAgdmFyIHN0YXRzID0gZ2V0U3RhdHModGhpcy5fZWxlbWVudHMuZ2VvbWV0cnkuc2VsZWN0QWxsKCdwYXRoJyksIHByb3BlcnRpZXNfYWNjZXNzb3IodmFsdWVGdW5jKSk7ICAgIFxyXG4gICAgcmV0dXJuIGQzLnNjYWxlLnNxcnQoKVxyXG4gICAgICAgIC5kb21haW4oWzAsc3RhdHMubWF4XSk7ICAgIFxyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5zeW1ib2xpemUgPSBmdW5jdGlvbihjYWxsYmFjaywgc2VsZWN0aW9uLCBmaW5hbGl6ZSkge1xyXG5cclxuICAgIHZhciBtYXAgPSB0aGlzO1xyXG4gICAgXHJcbiAgICAvLyBzdG9yZSBpbiBjbG9zdXJlIGZvciBsYXRlciBhY2Nlc3NcclxuICAgIHNlbGVjdGlvbiA9IHNlbGVjdGlvbiB8fCB0aGlzLnNlbGVjdGVkO1xyXG4gICAgdGhpcy5wcm9taXNlX2RhdGEoKS50aGVuKGZ1bmN0aW9uKGRhdGEpIHsgICAgICBcclxuICAgICAgICBtYXAuZ2V0UmVwcmVzZW50YXRpb25zKHNlbGVjdGlvbilcclxuICAgICAgICAgICAgLmVhY2goZnVuY3Rpb24oZ2VvbSkge1xyXG4gICAgICAgICAgICAgICAgY2FsbGJhY2suY2FsbChtYXAsIGQzLnNlbGVjdCh0aGlzKSwgZ2VvbSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIGlmIChmaW5hbGl6ZSkgZmluYWxpemUuY2FsbChtYXApO1xyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbi8vIFRPRE86IGltcHJvdmUgaGFuZGxpbmcgb2YgdXNpbmcgYSBmdW5jdGlvbiBoZXJlIHZzLiB1c2luZyBhIG5hbWVkIHByb3BlcnR5XHJcbi8vIHByb2JhYmx5IG5lZWRzIGEgdW5pZmllZCBtZWNoYW5pc20gdG8gZGVhbCB3aXRoIHByb3BlcnR5L2Z1bmMgdG8gYmUgdXNlZCBlbHNld2hlcmVcclxubWFwbWFwLnByb3RvdHlwZS5jaG9yb3BsZXRoID0gZnVuY3Rpb24oc3BlYywgbWV0YWRhdGEsIHNlbGVjdGlvbikgeyAgICBcclxuICAgIC8vIHdlIGhhdmUgdG8gcmVtZW1iZXIgdGhlIHNjYWxlIGZvciBsZWdlbmQoKVxyXG4gICAgdmFyIGNvbG9yU2NhbGUgPSBudWxsLFxyXG4gICAgICAgIHZhbHVlRnVuYyA9IGtleU9yQ2FsbGJhY2soc3BlYyksXHJcbiAgICAgICAgbWFwID0gdGhpcztcclxuICAgICAgICBcclxuICAgIGZ1bmN0aW9uIGNvbG9yKGVsLCBnZW9tLCBkYXRhKSB7XHJcbiAgICAgICAgaWYgKHNwZWMgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgLy8gY2xlYXJcclxuICAgICAgICAgICAgZWwuYXR0cignZmlsbCcsIHRoaXMuc2V0dGluZ3MucGF0aEF0dHJpYnV0ZXMuZmlsbCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gb24gZmlyc3QgY2FsbCwgc2V0IHVwIHNjYWxlICYgbGVnZW5kXHJcbiAgICAgICAgaWYgKCFjb2xvclNjYWxlKSB7XHJcbiAgICAgICAgICAgIC8vIFRPRE86IGltcHJvdmUgaGFuZGxpbmcgb2YgdGhpbmdzIHRoYXQgbmVlZCB0aGUgZGF0YSwgYnV0IHNob3VsZCBiZSBwZXJmb3JtZWRcclxuICAgICAgICAgICAgLy8gb25seSBvbmNlLiBTaG91bGQgd2UgcHJvdmlkZSBhIHNlcGFyYXRlIGNhbGxiYWNrIGZvciB0aGlzLCBvciB1c2UgdGhlIFxyXG4gICAgICAgICAgICAvLyBwcm9taXNlX2RhdGEoKS50aGVuKCkgZm9yIHNldHVwPyBBcyB0aGlzIGNvdWxkIGJlIGNvbnNpZGVyZWQgYSBwdWJsaWMgQVBJIHVzZWNhc2UsXHJcbiAgICAgICAgICAgIC8vIG1heWJlIHVzaW5nIHByb21pc2VzIGlzIGEgYml0IHN0ZWVwIGZvciBvdXRzaWRlIHVzZXJzP1xyXG4gICAgICAgICAgICBpZiAodHlwZW9mIG1ldGFkYXRhID09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgICAgICAgICBtZXRhZGF0YSA9IHRoaXMuZ2V0TWV0YWRhdGEobWV0YWRhdGEpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmICghbWV0YWRhdGEpIHtcclxuICAgICAgICAgICAgICAgIG1ldGFkYXRhID0gdGhpcy5nZXRNZXRhZGF0YShzcGVjKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjb2xvclNjYWxlID0gdGhpcy5hdXRvQ29sb3JTY2FsZShzcGVjLCBtZXRhZGF0YSk7XHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlTGVnZW5kKHNwZWMsIG1ldGFkYXRhLCBjb2xvclNjYWxlLCBzZWxlY3Rpb24pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoZWwuYXR0cignZmlsbCcpICE9ICdub25lJykge1xyXG4gICAgICAgICAgICAvLyB0cmFuc2l0aW9uIGlmIGNvbG9yIGFscmVhZHkgc2V0XHJcbiAgICAgICAgICAgIGVsID0gZWwudHJhbnNpdGlvbigpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbC5hdHRyKCdmaWxsJywgZnVuY3Rpb24oZ2VvbSkgeyAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciB2YWwgPSB2YWx1ZUZ1bmMoZ2VvbS5wcm9wZXJ0aWVzKTtcclxuICAgICAgICAgICAgLy8gZXhwbGljaXRseSBjaGVjayBpZiB2YWx1ZSBpcyB2YWxpZCAtIHRoaXMgY2FuIGJlIGEgcHJvYmxlbSB3aXRoIG9yZGluYWwgc2NhbGVzXHJcbiAgICAgICAgICAgIGlmICh0eXBlb2YodmFsKSA9PSAndW5kZWZpbmVkJykge1xyXG4gICAgICAgICAgICAgICAgdmFsID0gbWV0YWRhdGEudW5kZWZpbmVkVmFsdWU7IFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiBjb2xvclNjYWxlKHZhbCkgfHwgbWFwLnNldHRpbmdzLnBhdGhBdHRyaWJ1dGVzLmZpbGw7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRoaXMuc3ltYm9saXplKGNvbG9yLCBzZWxlY3Rpb24sIGZ1bmN0aW9uKCl7XHJcbiAgICAgICAgdGhpcy5kaXNwYXRjaGVyLmNob3JvcGxldGguY2FsbCh0aGlzLCBzcGVjKTtcclxuICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLnN0cm9rZUNvbG9yID0gZnVuY3Rpb24oc3BlYywgbWV0YWRhdGEsIHNlbGVjdGlvbikgeyAgICBcclxuICAgIC8vIHdlIGhhdmUgdG8gcmVtZW1iZXIgdGhlIHNjYWxlIGZvciBsZWdlbmQoKVxyXG4gICAgdmFyIGNvbG9yU2NhbGUgPSBudWxsLFxyXG4gICAgICAgIHZhbHVlRnVuYyA9IGtleU9yQ2FsbGJhY2soc3BlYyksXHJcbiAgICAgICAgbWFwID0gdGhpcztcclxuICAgICAgICBcclxuICAgIGZ1bmN0aW9uIGNvbG9yKGVsLCBnZW9tLCBkYXRhKSB7XHJcbiAgICAgICAgaWYgKHNwZWMgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgLy8gY2xlYXJcclxuICAgICAgICAgICAgZWwuYXR0cignc3Ryb2tlJywgdGhpcy5zZXR0aW5ncy5wYXRoQXR0cmlidXRlcy5zdHJva2UpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIG9uIGZpcnN0IGNhbGwsIHNldCB1cCBzY2FsZSAmIGxlZ2VuZFxyXG4gICAgICAgIGlmICghY29sb3JTY2FsZSkge1xyXG4gICAgICAgICAgICAvLyBUT0RPOiBpbXByb3ZlIGhhbmRsaW5nIG9mIHRoaW5ncyB0aGF0IG5lZWQgdGhlIGRhdGEsIGJ1dCBzaG91bGQgYmUgcGVyZm9ybWVkXHJcbiAgICAgICAgICAgIC8vIG9ubHkgb25jZS4gU2hvdWxkIHdlIHByb3ZpZGUgYSBzZXBhcmF0ZSBjYWxsYmFjayBmb3IgdGhpcywgb3IgdXNlIHRoZSBcclxuICAgICAgICAgICAgLy8gcHJvbWlzZV9kYXRhKCkudGhlbigpIGZvciBzZXR1cD8gQXMgdGhpcyBjb3VsZCBiZSBjb25zaWRlcmVkIGEgcHVibGljIEFQSSB1c2VjYXNlLFxyXG4gICAgICAgICAgICAvLyBtYXliZSB1c2luZyBwcm9taXNlcyBpcyBhIGJpdCBzdGVlcCBmb3Igb3V0c2lkZSB1c2Vycz9cclxuICAgICAgICAgICAgaWYgKHR5cGVvZiBtZXRhZGF0YSA9PSAnc3RyaW5nJykge1xyXG4gICAgICAgICAgICAgICAgbWV0YWRhdGEgPSB0aGlzLmdldE1ldGFkYXRhKG1ldGFkYXRhKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoIW1ldGFkYXRhKSB7XHJcbiAgICAgICAgICAgICAgICBtZXRhZGF0YSA9IHRoaXMuZ2V0TWV0YWRhdGEoc3BlYyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29sb3JTY2FsZSA9IHRoaXMuYXV0b0NvbG9yU2NhbGUoc3BlYywgbWV0YWRhdGEpO1xyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUxlZ2VuZChzcGVjLCBtZXRhZGF0YSwgY29sb3JTY2FsZSwgc2VsZWN0aW9uKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGVsLmF0dHIoJ3N0cm9rZScpICE9ICdub25lJykge1xyXG4gICAgICAgICAgICAvLyB0cmFuc2l0aW9uIGlmIGNvbG9yIGFscmVhZHkgc2V0XHJcbiAgICAgICAgICAgIGVsID0gZWwudHJhbnNpdGlvbigpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbC5hdHRyKCdzdHJva2UnLCBmdW5jdGlvbihnZW9tKSB7ICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIHZhbCA9IHZhbHVlRnVuYyhnZW9tLnByb3BlcnRpZXMpO1xyXG4gICAgICAgICAgICAvLyBleHBsaWNpdGx5IGNoZWNrIGlmIHZhbHVlIGlzIHZhbGlkIC0gdGhpcyBjYW4gYmUgYSBwcm9ibGVtIHdpdGggb3JkaW5hbCBzY2FsZXNcclxuICAgICAgICAgICAgaWYgKHR5cGVvZih2YWwpID09ICd1bmRlZmluZWQnKSB7XHJcbiAgICAgICAgICAgICAgICB2YWwgPSBtZXRhZGF0YS51bmRlZmluZWRWYWx1ZTsgXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIGNvbG9yU2NhbGUodmFsKSB8fCBtYXAuc2V0dGluZ3MucGF0aEF0dHJpYnV0ZXMuc3Ryb2tlO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB0aGlzLnN5bWJvbGl6ZShjb2xvciwgc2VsZWN0aW9uKTtcclxuICAgICAgICBcclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5wcm9wb3J0aW9uYWxfY2lyY2xlcyA9IGZ1bmN0aW9uKHZhbHVlLCBzY2FsZSkge1xyXG4gICAgXHJcbiAgICB2YXIgdmFsdWVGdW5jID0ga2V5T3JDYWxsYmFjayh2YWx1ZSk7XHJcblxyXG4gICAgdmFyIHBhdGhHZW5lcmF0b3IgPSBkMy5nZW8ucGF0aCgpLnByb2plY3Rpb24odGhpcy5fcHJvamVjdGlvbik7ICAgIFxyXG4gICAgXHJcbiAgICBzY2FsZSA9IHNjYWxlIHx8IDIwO1xyXG4gICAgXHJcbiAgICB0aGlzLnN5bWJvbGl6ZShmdW5jdGlvbihlbCwgZ2VvbSwgZGF0YSkge1xyXG4gICAgICAgIGlmICh2YWx1ZSA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICB0aGlzLl9lbGVtZW50cy5vdmVybGF5LnNlbGVjdCgnY2lyY2xlJykucmVtb3ZlKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgaWYgKGdlb20ucHJvcGVydGllcyAmJiB0eXBlb2YgdmFsdWVGdW5jKGdlb20ucHJvcGVydGllcykgIT0gJ3VuZGVmaW5lZCcpIHtcclxuICAgICAgICAgICAgLy8gaWYgc2NhbGUgaXMgbm90IHNldCwgY2FsY3VsYXRlIHNjYWxlIG9uIGZpcnN0IGNhbGxcclxuICAgICAgICAgICAgaWYgKHR5cGVvZiBzY2FsZSAhPSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgICAgICBzY2FsZSA9IHRoaXMuYXV0b1NxcnRTY2FsZSh2YWx1ZUZ1bmMpLnJhbmdlKFswLHNjYWxlXSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdmFyIGNlbnRyb2lkID0gcGF0aEdlbmVyYXRvci5jZW50cm9pZChnZW9tKTtcclxuICAgICAgICAgICAgdGhpcy5fZWxlbWVudHMub3ZlcmxheS5hcHBlbmQoJ2NpcmNsZScpXHJcbiAgICAgICAgICAgICAgICAuYXR0cih0aGlzLnNldHRpbmdzLm92ZXJsYXlBdHRyaWJ1dGVzKVxyXG4gICAgICAgICAgICAgICAgLmF0dHIoe1xyXG4gICAgICAgICAgICAgICAgICAgIHI6IHNjYWxlKHZhbHVlRnVuYyhnZW9tLnByb3BlcnRpZXMpKSxcclxuICAgICAgICAgICAgICAgICAgICBjeDogY2VudHJvaWRbMF0sXHJcbiAgICAgICAgICAgICAgICAgICAgY3k6IGNlbnRyb2lkWzFdXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxubWFwbWFwLnN5bWJvbGl6ZSA9IHt9O1xyXG5cclxubWFwbWFwLnN5bWJvbGl6ZS5hZGRMYWJlbCA9IGZ1bmN0aW9uKHNwZWMpIHtcclxuXHJcbiAgICB2YXIgdmFsdWVGdW5jID0ga2V5T3JDYWxsYmFjayhzcGVjKTtcclxuICAgICAgICBcclxuICAgIHZhciBwYXRoR2VuZXJhdG9yID0gZDMuZ2VvLnBhdGgoKTsgICAgXHJcblxyXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGVsLCBnZW9tLCBkYXRhKSB7XHJcbiAgICAgICAgLy8gbGF6eSBpbml0aWFsaXphdGlvbiBvZiBwcm9qZWN0aW9uXHJcbiAgICAgICAgLy8gd2UgZG9udCd0IGhhdmUgYWNjZXNzIHRvIHRoZSBtYXAgYWJvdmUsIGFuZCBhbHNvIHByb2plY3Rpb25cclxuICAgICAgICAvLyBtYXkgbm90IGhhdmUgYmVlbiBpbml0aWFsaXplZCBjb3JyZWN0bHlcclxuICAgICAgICBpZiAocGF0aEdlbmVyYXRvci5wcm9qZWN0aW9uKCkgIT09IHRoaXMuX3Byb2plY3Rpb24pIHtcclxuICAgICAgICAgICAgcGF0aEdlbmVyYXRvci5wcm9qZWN0aW9uKHRoaXMuX3Byb2plY3Rpb24pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gVE9ETzogaG93IHRvIHByb3Blcmx5IHJlbW92ZSBzeW1ib2xpemF0aW9ucz9cclxuICAgICAgICBpZiAoc3BlYyA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICB0aGlzLl9lbGVtZW50cy5vdmVybGF5LnNlbGVjdCgnY2lyY2xlJykucmVtb3ZlKCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGdlb20ucHJvcGVydGllcyAmJiB0eXBlb2YgdmFsdWVGdW5jKGdlb20ucHJvcGVydGllcykgIT0gJ3VuZGVmaW5lZCcpIHtcclxuICAgICAgICAgICAgdmFyIGNlbnRyb2lkID0gcGF0aEdlbmVyYXRvci5jZW50cm9pZChnZW9tKTtcclxuICAgICAgICAgICAgdGhpcy5fZWxlbWVudHMub3ZlcmxheS5hcHBlbmQoJ3RleHQnKVxyXG4gICAgICAgICAgICAgICAgLnRleHQodmFsdWVGdW5jKGdlb20ucHJvcGVydGllcykpXHJcbiAgICAgICAgICAgICAgICAuYXR0cih7XHJcbiAgICAgICAgICAgICAgICAgICAgc3Ryb2tlOiAnI2ZmZmZmZicsXHJcbiAgICAgICAgICAgICAgICAgICAgZmlsbDogJyMwMDAwMDAnLFxyXG4gICAgICAgICAgICAgICAgICAgICdmb250LXNpemUnOiA5LFxyXG4gICAgICAgICAgICAgICAgICAgICdwYWludC1vcmRlcic6ICdzdHJva2UgZmlsbCcsXHJcbiAgICAgICAgICAgICAgICAgICAgJ2FsaWdubWVudC1iYXNlbGluZSc6ICdtaWRkbGUnLFxyXG4gICAgICAgICAgICAgICAgICAgIGR4OiA3LFxyXG4gICAgICAgICAgICAgICAgICAgIGR5OiAxXHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgICAgLmF0dHIoeyAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgeDogY2VudHJvaWRbMF0sXHJcbiAgICAgICAgICAgICAgICAgICAgeTogY2VudHJvaWRbMV1cclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFkZE9wdGlvbmFsRWxlbWVudChlbGVtZW50TmFtZSkge1xyXG4gICAgcmV0dXJuIGZ1bmN0aW9uKHZhbHVlKSB7XHJcbiAgICAgICAgdmFyIHZhbHVlRnVuYyA9IGtleU9yQ2FsbGJhY2sodmFsdWUpO1xyXG4gICAgICAgIHRoaXMuc3ltYm9saXplKGZ1bmN0aW9uKGVsLCBkKSB7ICBcclxuICAgICAgICAgICAgaWYgKHZhbHVlID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICBlbC5zZWxlY3QoZWxlbWVudE5hbWUpLnJlbW92ZSgpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsLmFwcGVuZChlbGVtZW50TmFtZSlcclxuICAgICAgICAgICAgICAgIC50ZXh0KHZhbHVlRnVuYyhkLnByb3BlcnRpZXMpKTtcclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH07XHJcbn1cclxuXHJcbm1hcG1hcC5wcm90b3R5cGUudGl0bGUgPSBhZGRPcHRpb25hbEVsZW1lbnQoJ3RpdGxlJyk7XHJcbm1hcG1hcC5wcm90b3R5cGUuZGVzYyA9IGFkZE9wdGlvbmFsRWxlbWVudCgnZGVzYycpO1xyXG5cclxudmFyIGNlbnRlciA9IHtcclxuICAgIHg6IDAuNSxcclxuICAgIHk6IDAuNVxyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5jZW50ZXIgPSBmdW5jdGlvbihjZW50ZXJfeCwgY2VudGVyX3kpIHtcclxuICAgIGNlbnRlci54ID0gY2VudGVyX3g7XHJcbiAgICBpZiAodHlwZW9mIGNlbnRlcl95ICE9ICd1bmRlZmluZWQnKSB7XHJcbiAgICAgICAgY2VudGVyLnkgPSBjZW50ZXJfeTtcclxuICAgIH1cclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG4vLyBzdG9yZSBhbGwgaG92ZXIgb3V0IGNhbGxiYWNrcyBoZXJlLCB0aGlzIHdpbGwgYmUgY2FsbGVkIG9uIHpvb21cclxudmFyIGhvdmVyT3V0Q2FsbGJhY2tzID0gW107XHJcblxyXG5mdW5jdGlvbiBjYWxsSG92ZXJPdXQoKSB7XHJcbiAgICBmb3IgKHZhciBpPTA7IGk8aG92ZXJPdXRDYWxsYmFja3MubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBob3Zlck91dENhbGxiYWNrc1tpXSgpO1xyXG4gICAgfVxyXG59XHJcblxyXG52YXIgbW91c2VvdmVyID0gbnVsbDtcclxuXHJcbm1hcG1hcC5zaG93SG92ZXIgPSBmdW5jdGlvbihlbCkge1xyXG4gICAgaWYgKG1vdXNlb3Zlcikge1xyXG4gICAgICAgIG1vdXNlb3Zlci5jYWxsKGVsLCBlbC5fX2RhdGFfXyk7XHJcbiAgICB9XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLmdldEFuY2hvckZvclJlcHIgPSBmdW5jdGlvbihldmVudCwgcmVwciwgb3B0aW9ucykge1xyXG5cclxuICAgIG9wdGlvbnMgPSBkZC5tZXJnZSh7XHJcbiAgICAgICAgY2xpcFRvVmlld3BvcnQ6IHRydWUsXHJcbiAgICAgICAgY2xpcE1hcmdpbnM6IHt0b3A6IDQwLCBsZWZ0OiA0MCwgYm90dG9tOiAwLCByaWdodDogNDB9XHJcbiAgICB9LCBvcHRpb25zKTtcclxuXHJcbiAgICB2YXIgYm91bmRzID0gcmVwci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgIHZhciBwdCA9IHRoaXMuX2VsZW1lbnRzLm1haW4ubm9kZSgpLmNyZWF0ZVNWR1BvaW50KCk7XHJcbiAgICBcclxuICAgIHB0LnggPSAoYm91bmRzLmxlZnQgKyBib3VuZHMucmlnaHQpIC8gMjtcclxuICAgIHB0LnkgPSBib3VuZHMudG9wO1xyXG4gICAgXHJcbiAgICB2YXIgbWFwQm91bmRzID0gdGhpcy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgIGlmIChvcHRpb25zLmNsaXBUb1ZpZXdwb3J0KSB7ICAgICAgICAgICAgICAgIFxyXG4gICAgICAgIGlmIChwdC54IDwgbWFwQm91bmRzLmxlZnQgKyBvcHRpb25zLmNsaXBNYXJnaW5zLmxlZnQpIHB0LnggPSBtYXBCb3VuZHMubGVmdCArIG9wdGlvbnMuY2xpcE1hcmdpbnMubGVmdDtcclxuICAgICAgICBpZiAocHQueCA+IG1hcEJvdW5kcy5yaWdodCAtIG9wdGlvbnMuY2xpcE1hcmdpbnMucmlnaHQpIHB0LnggPSBtYXBCb3VuZHMucmlnaHQgLSBvcHRpb25zLmNsaXBNYXJnaW5zLnJpZ2h0O1xyXG4gICAgICAgIGlmIChwdC55IDwgbWFwQm91bmRzLnRvcCArIG9wdGlvbnMuY2xpcE1hcmdpbnMudG9wKSBwdC55ID0gbWFwQm91bmRzLnRvcCArIG9wdGlvbnMuY2xpcE1hcmdpbnMudG9wO1xyXG4gICAgICAgIGlmIChwdC55ID4gbWFwQm91bmRzLmJvdHRvbSAtIG9wdGlvbnMuY2xpcE1hcmdpbnMuYm90dG9tKSBwdC55ID0gbWFwQm91bmRzLmJvdHRvbSAtIG9wdGlvbnMuY2xpcE1hcmdpbnMuYm90dG9tO1xyXG4gICAgfVxyXG4gICAgcHQueCAtPSBtYXBCb3VuZHMubGVmdDtcclxuICAgIHB0LnkgLT0gbWFwQm91bmRzLnRvcDtcclxuXHJcbiAgICByZXR1cm4gcHQ7XHJcbn1cclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuZ2V0QW5jaG9yRm9yTW91c2VQb3NpdGlvbiA9IGZ1bmN0aW9uKGV2ZW50LCByZXByLCBvcHRpb25zKSB7XHJcbiAgICAgXHJcbiAgICBvcHRpb25zID0gZGQubWVyZ2Uoe1xyXG4gICAgICAgIGFuY2hvck9mZnNldDogWzAsLTIwXVxyXG4gICAgIH0sIG9wdGlvbnMpO1xyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgeDogZXZlbnQub2Zmc2V0WCArIG9wdGlvbnMuYW5jaG9yT2Zmc2V0WzBdLFxyXG4gICAgICAgIHk6IGV2ZW50Lm9mZnNldFkgKyBvcHRpb25zLmFuY2hvck9mZnNldFsxXVxyXG4gICAgfVxyXG59XHJcblxyXG5cclxubWFwbWFwLnByb3RvdHlwZS5ob3ZlciA9IGZ1bmN0aW9uKG92ZXJDQiwgb3V0Q0IsIG9wdGlvbnMpIHtcclxuXHJcbiAgICBvcHRpb25zID0gZGQubWVyZ2Uoe1xyXG4gICAgICAgIG1vdmVUb0Zyb250OiB0cnVlLFxyXG4gICAgICAgIGNsaXBUb1ZpZXdwb3J0OiB0cnVlLFxyXG4gICAgICAgIGNsaXBNYXJnaW5zOiB7dG9wOiA0MCwgbGVmdDogNDAsIGJvdHRvbTogMCwgcmlnaHQ6IDQwfSxcclxuICAgICAgICBzZWxlY3Rpb246IG51bGwsXHJcbiAgICAgICAgYW5jaG9yUG9zaXRpb246IHRoaXMuZ2V0QW5jaG9yRm9yUmVwclxyXG4gICAgIH0sIG9wdGlvbnMpO1xyXG4gICAgXHJcbiAgICB2YXIgbWFwID0gdGhpcztcclxuICAgIFxyXG4gICAgaWYgKCF0aGlzLl9vbGRQb2ludGVyRXZlbnRzKSB7XHJcbiAgICAgICAgdGhpcy5fb2xkUG9pbnRlckV2ZW50cyA9IFtdO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB0aGlzLnByb21pc2VfZGF0YSgpLnRoZW4oZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgdmFyIG9iaiA9IG1hcC5nZXRSZXByZXNlbnRhdGlvbnMob3B0aW9ucy5zZWxlY3Rpb24pO1xyXG4gICAgICAgIG1vdXNlb3ZlciA9IGZ1bmN0aW9uKGQpIHtcclxuICAgICAgICAgICAgLy8gXCJ0aGlzXCIgaXMgdGhlIGVsZW1lbnQsIG5vdCB0aGUgbWFwIVxyXG4gICAgICAgICAgICAvLyBtb3ZlIHRvIHRvcCA9IGVuZCBvZiBwYXJlbnQgbm9kZVxyXG4gICAgICAgICAgICAvLyB0aGlzIHNjcmV3cyB1cCBJRSBldmVudCBoYW5kbGluZyFcclxuICAgICAgICAgICAgaWYgKG9wdGlvbnMubW92ZVRvRnJvbnQgJiYgbWFwLnN1cHBvcnRzLmhvdmVyRG9tTW9kaWZpY2F0aW9uKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBUT0RPOiB0aGlzIHNob3VsZCBiZSBzb2x2ZWQgdmlhIGEgc2Vjb25kIGVsZW1lbnQgdG8gYmUgcGxhY2VkIGluIGZyb250IVxyXG4gICAgICAgICAgICAgICAgdGhpcy5fX2hvdmVyaW5zZXJ0cG9zaXRpb25fXyA9IHRoaXMubmV4dFNpYmxpbmc7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBhcmVudE5vZGUuYXBwZW5kQ2hpbGQodGhpcyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBhbmNob3IgPSBvcHRpb25zLmFuY2hvclBvc2l0aW9uLmNhbGwobWFwLCBkMy5ldmVudCwgdGhpcywgb3B0aW9ucyk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBvdmVyQ0IuY2FsbChtYXAsIGQucHJvcGVydGllcywgYW5jaG9yLCB0aGlzKTsgICAgICAgICAgIFxyXG4gICAgICAgIH07XHJcbiAgICAgICAgLy8gcmVzZXQgcHJldmlvdXNseSBvdmVycmlkZGVuIHBvaW50ZXIgZXZlbnRzXHJcbiAgICAgICAgZm9yICh2YXIgaT0wOyBpPG1hcC5fb2xkUG9pbnRlckV2ZW50cy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICB2YXIgcGFpciA9IG1hcC5fb2xkUG9pbnRlckV2ZW50c1tpXTtcclxuICAgICAgICAgICAgcGFpclswXS5zdHlsZSgncG9pbnRlci1ldmVudHMnLCBwYWlyWzFdKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgbWFwLl9vbGRQb2ludGVyRXZlbnRzID0gW107XHJcbiAgICAgICAgaWYgKG92ZXJDQikge1xyXG4gICAgICAgICAgICBvYmpcclxuICAgICAgICAgICAgICAgIC5vbignbW91c2VvdmVyJywgbW91c2VvdmVyKVxyXG4gICAgICAgICAgICAgICAgLmVhY2goZnVuY3Rpb24oKXtcclxuICAgICAgICAgICAgICAgICAgICAvLyBUT0RPOiBub3Qgc3VyZSBpZiB0aGlzIGlzIHRoZSBiZXN0IGlkZWEsIGJ1dCB3ZSBuZWVkIHRvIG1ha2Ugc3VyZVxyXG4gICAgICAgICAgICAgICAgICAgIC8vIHRvIHJlY2VpdmUgcG9pbnRlciBldmVudHMgZXZlbiBpZiBjc3MgZGlzYWJsZXMgdGhlbS4gVGhpcyBoYXMgdG8gd29ya1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIGV2ZW4gZm9yIGNvbXBsZXggKGZ1bmN0aW9uLWJhc2VkKSBzZWxlY3Rpb25zLCBzbyB3ZSBjYW5ub3QgdXNlIGNvbnRhaW5tZW50XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gc2VsZWN0b3JzIChlLmcuIC5zZWxlY3RlZC1mb28gLmZvbykgZm9yIHRoaXMuLi5cclxuICAgICAgICAgICAgICAgICAgICAvLyBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9TVkcvQXR0cmlidXRlL3BvaW50ZXItZXZlbnRzXHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIHNlbCA9IGQzLnNlbGVjdCh0aGlzKTtcclxuICAgICAgICAgICAgICAgICAgICBtYXAuX29sZFBvaW50ZXJFdmVudHMucHVzaChbc2VsLCBzZWwuc3R5bGUoJ3BvaW50ZXItZXZlbnRzJyldKTtcclxuICAgICAgICAgICAgICAgICAgICAvLyBUT0RPOiB0aGlzIHNob3VsZCBiZSBjb25maWd1cmFibGUgdmlhIG9wdGlvbnNcclxuICAgICAgICAgICAgICAgICAgICAvL3NlbC5zdHlsZSgncG9pbnRlci1ldmVudHMnLCdhbGwnKTtcclxuICAgICAgICAgICAgICAgICAgICBzZWwuc3R5bGUoJ3BvaW50ZXItZXZlbnRzJywndmlzaWJsZVBhaW50ZWQnKTtcclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIDtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIG9iai5vbignbW91c2VvdmVyJywgbnVsbCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChvdXRDQikge1xyXG4gICAgICAgICAgICBvYmoub24oJ21vdXNlb3V0JywgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5fX2hvdmVyaW5zZXJ0cG9zaXRpb25fXykge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUodGhpcywgdGhpcy5fX2hvdmVyaW5zZXJ0cG9zaXRpb25fXyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpZiAob3V0Q0IpIG91dENCKCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBob3Zlck91dENhbGxiYWNrcy5wdXNoKG91dENCKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIG9iai5vbignbW91c2VvdXQnLCBudWxsKTtcclxuICAgICAgICB9ICAgICAgICAgIFxyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuZm9ybWF0VmFsdWUgPSBmdW5jdGlvbihkLCBhdHRyKSB7XHJcbiAgICB2YXIgbWV0YSA9IHRoaXMuZ2V0TWV0YWRhdGEoYXR0ciksXHJcbiAgICAgICAgdmFsID0gbWV0YS5mb3JtYXQoZFthdHRyXSk7XHJcbiAgICBpZiAodmFsID09ICdOYU4nKSB2YWwgPSBkW2F0dHJdO1xyXG4gICAgcmV0dXJuIHZhbDtcclxufTtcclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuYnVpbGRIVE1MRnVuYyA9IGZ1bmN0aW9uKHNwZWMpIHtcclxuICAgIC8vIGZ1bmN0aW9uIGNhc2VcclxuICAgIGlmICh0eXBlb2Ygc3BlYyA9PSAnZnVuY3Rpb24nKSByZXR1cm4gc3BlYztcclxuICAgIC8vIHN0cmluZyBjYXNlXHJcbiAgICBpZiAoc3BlYy5zdWJzdHIpIHNwZWMgPSBbc3BlY107XHJcbiAgICBcclxuICAgIHZhciBtYXAgPSB0aGlzO1xyXG4gICAgXHJcbiAgICB2YXIgZnVuYyA9IGZ1bmN0aW9uKGQpIHtcclxuICAgICAgICB2YXIgaHRtbCA9IFwiXCIsXHJcbiAgICAgICAgICAgIHByZSwgcG9zdDtcclxuICAgICAgICBmb3IgKHZhciBpPTA7IGk8c3BlYy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICB2YXIgcGFydCA9IHNwZWNbaV07XHJcbiAgICAgICAgICAgIGlmIChwYXJ0KSB7XHJcbiAgICAgICAgICAgICAgICBwcmUgPSAoaT09MCkgPyAnPGI+JyA6ICcnO1xyXG4gICAgICAgICAgICAgICAgcG9zdCA9IChpPT0wKSA/ICc8L2I+PGJyPicgOiAnPGJyPic7XHJcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHBhcnQgPT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBzdHIgPSBwYXJ0LmNhbGwobWFwLCBkKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoc3RyKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGh0bWwgKz0gcHJlICsgc3RyICsgcG9zdDtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB2YXIgbWV0YSA9IG1hcC5nZXRNZXRhZGF0YShwYXJ0KTtcclxuICAgICAgICAgICAgICAgIHZhciBwcmVmaXggPSBtZXRhLmhvdmVyTGFiZWwgfHwgbWV0YS52YWx1ZUxhYmVsIHx8IG1ldGEubGFiZWwgfHwgJyc7XHJcbiAgICAgICAgICAgICAgICBpZiAocHJlZml4KSBwcmVmaXggKz0gXCI6IFwiO1xyXG4gICAgICAgICAgICAgICAgdmFyIHZhbCA9IG1ldGEuZm9ybWF0KGRbcGFydF0pO1xyXG4gICAgICAgICAgICAgICAgaWYgKHZhbCA9PSAnTmFOJykgdmFsID0gZFtwYXJ0XTtcclxuICAgICAgICAgICAgICAgIC8vIFRPRE86IG1ha2Ugb3B0aW9uIFwiaWdub3JlVW5kZWZpbmVkXCIgZXRjLlxyXG4gICAgICAgICAgICAgICAgaWYgKHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbWV0YS51bmRlZmluZWRWYWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGh0bWwgKz0gcHJlICsgcHJlZml4ICsgdmFsICsgcG9zdDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gaHRtbDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHJldHVybiBmdW5jO1xyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5ob3ZlckluZm8gPSBmdW5jdGlvbihzcGVjLCBvcHRpb25zKSB7XHJcblxyXG4gICAgb3B0aW9ucyA9IGRkLm1lcmdlKHtcclxuICAgICAgICBzZWxlY3Rpb246IG51bGwsXHJcbiAgICAgICAgaG92ZXJDbGFzc05hbWU6ICdob3ZlckluZm8nLFxyXG4gICAgICAgIGhvdmVyU3R5bGU6IHtcclxuICAgICAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsXHJcbiAgICAgICAgICAgIHBhZGRpbmc6ICcwLjVlbSAwLjdlbScsXHJcbiAgICAgICAgICAgICdiYWNrZ3JvdW5kLWNvbG9yJzogJ3JnYmEoMjU1LDI1NSwyNTUsMC44NSknXHJcbiAgICAgICAgfSxcclxuICAgICAgICBob3ZlckVudGVyU3R5bGU6IHtcclxuICAgICAgICAgICAgZGlzcGxheTogJ2Jsb2NrJ1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgaG92ZXJMZWF2ZVN0eWxlOiB7XHJcbiAgICAgICAgICAgIGRpc3BsYXk6ICdub25lJ1xyXG4gICAgICAgIH1cclxuICAgIH0sIG9wdGlvbnMpO1xyXG4gICAgXHJcbiAgICB2YXIgaG92ZXJFbCA9IHRoaXMuX2VsZW1lbnRzLnBhcmVudC5maW5kKCcuJyArIG9wdGlvbnMuaG92ZXJDbGFzc05hbWUpO1xyXG5cclxuICAgIGlmICghc3BlYykge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmhvdmVyKG51bGwsIG51bGwsIG9wdGlvbnMpO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBodG1sRnVuYyA9IHRoaXMuYnVpbGRIVE1MRnVuYyhzcGVjKTtcclxuICAgIGlmIChob3ZlckVsLmxlbmd0aCA9PSAwKSB7XHJcbiAgICAgICAgaG92ZXJFbCA9ICQoJzxkaXYgY2xhc3M9XCInICsgb3B0aW9ucy5ob3ZlckNsYXNzTmFtZSArICdcIj48L2Rpdj4nKTtcclxuICAgICAgICB0aGlzLl9lbGVtZW50cy5wYXJlbnQuYXBwZW5kKGhvdmVyRWwpO1xyXG4gICAgfVxyXG4gICAgaG92ZXJFbC5jc3Mob3B0aW9ucy5ob3ZlclN0eWxlKTtcclxuICAgIGlmICghaG92ZXJFbC5tYXBtYXBfZXZlbnRIYW5kbGVySW5zdGFsbGVkKSB7XHJcbiAgICAgICAgaG92ZXJFbC5vbignbW91c2VlbnRlcicsIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICBob3ZlckVsLmNzcyhvcHRpb25zLmhvdmVyRW50ZXJTdHlsZSk7XHJcbiAgICAgICAgfSkub24oJ21vdXNlbGVhdmUnLCBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgaG92ZXJFbC5jc3Mob3B0aW9ucy5ob3ZlckxlYXZlU3R5bGUpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGhvdmVyRWwubWFwbWFwX2V2ZW50SGFuZGxlckluc3RhbGxlZCA9IHRydWU7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHNob3coZCwgcG9pbnQpe1xyXG4gICAgICAgIC8vIG9mZnNldFBhcmVudCBvbmx5IHdvcmtzIGZvciByZW5kZXJlZCBvYmplY3RzLCBzbyBwbGFjZSBvYmplY3QgZmlyc3QhXHJcbiAgICAgICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0hUTUxFbGVtZW50Lm9mZnNldFBhcmVudFxyXG4gICAgICAgIGhvdmVyRWwuY3NzKG9wdGlvbnMuaG92ZXJFbnRlclN0eWxlKTsgIFxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBvZmZzZXRFbCA9IGhvdmVyRWwub2Zmc2V0UGFyZW50KCksXHJcbiAgICAgICAgICAgIG9mZnNldEhlaWdodCA9IG9mZnNldEVsLm91dGVySGVpZ2h0KGZhbHNlKSxcclxuICAgICAgICAgICAgbWFpbkVsID0gdGhpcy5fZWxlbWVudHMubWFpbi5ub2RlKCksXHJcbiAgICAgICAgICAgIHNjcm9sbFRvcCA9IHdpbmRvdy5wYWdlWU9mZnNldCB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2Nyb2xsVG9wIHx8IGRvY3VtZW50LmJvZHkuc2Nyb2xsVG9wIHx8IDAsXHJcbiAgICAgICAgICAgIHRvcCA9IG1haW5FbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS50b3AgKyBzY3JvbGxUb3AgLSBvZmZzZXRFbC5vZmZzZXQoKS50b3A7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgaG92ZXJFbFxyXG4gICAgICAgICAgICAuY3NzKHtcclxuICAgICAgICAgICAgICAgIGJvdHRvbTogKG9mZnNldEhlaWdodCAtIHRvcCAtIHBvaW50LnkpICsgJ3B4JyxcclxuICAgICAgICAgICAgICAgIC8vdG9wOiBwb2ludC55ICsgJ3B4JyxcclxuICAgICAgICAgICAgICAgIGxlZnQ6IHBvaW50LnggKyAncHgnXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIC5odG1sKGh0bWxGdW5jKGQpKTtcclxuICAgIH1cclxuICAgIGZ1bmN0aW9uIGhpZGUoKSB7XHJcbiAgICAgICAgaG92ZXJFbC5jc3Mob3B0aW9ucy5ob3ZlckxlYXZlU3R5bGUpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gdGhpcy5ob3ZlcihzaG93LCBoaWRlLCBvcHRpb25zKTtcclxufTtcclxuXHJcbi8vIHJlbW92ZSBhbGwgc3ltYm9sb2d5XHJcbi8vIFRPRE86IHN5bWJvbGl6ZXJzIHNob3VsZCBiZSByZWdpc3RlcmVkIHNvbWVob3cgYW5kIGl0ZXJhdGVkIG92ZXIgaGVyZVxyXG5tYXBtYXAucHJvdG90eXBlLmNsZWFyID0gZnVuY3Rpb24oKSB7XHJcbiAgICB0aGlzLmNob3JvcGxldGgobnVsbCk7XHJcbiAgICB0aGlzLnByb3BvcnRpb25hbF9jaXJjbGVzKG51bGwpO1xyXG4gICAgdGhpcy50aXRsZShudWxsKTtcclxuICAgIHRoaXMuZGVzYyhudWxsKTtcclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxuLy8gbmFtZXNwYWNlIGZvciByZS11c2FibGUgYmVoYXZpb3JzXHJcbm1hcG1hcC5iZWhhdmlvciA9IHt9O1xyXG5cclxubWFwbWFwLmJlaGF2aW9yLnpvb20gPSBmdW5jdGlvbihvcHRpb25zKSB7XHJcblxyXG4gICAgb3B0aW9ucyA9IGRkLm1lcmdlKHtcclxuICAgICAgICBldmVudDogJ2NsaWNrJyxcclxuICAgICAgICBjdXJzb3I6ICdwb2ludGVyJyxcclxuICAgICAgICBmaXRTY2FsZTogMC43LFxyXG4gICAgICAgIGFuaW1hdGlvbkR1cmF0aW9uOiA3NTAsXHJcbiAgICAgICAgbWF4Wm9vbTogOCxcclxuICAgICAgICBoaWVyYXJjaGljYWw6IGZhbHNlLFxyXG4gICAgICAgIHNob3dSaW5nOiB0cnVlLFxyXG4gICAgICAgIHJpbmdSYWRpdXM6IDEuMSwgLy8gcmVsYXRpdmUgdG8gaGVpZ2h0LzJcclxuICAgICAgICB6b29tc3RhcnQ6IG51bGwsXHJcbiAgICAgICAgem9vbWVuZDogbnVsbCxcclxuICAgICAgICByaW5nQXR0cmlidXRlczoge1xyXG4gICAgICAgICAgICBzdHJva2U6ICcjMDAwJyxcclxuICAgICAgICAgICAgJ3N0cm9rZS13aWR0aCc6IDYsXHJcbiAgICAgICAgICAgICdzdHJva2Utb3BhY2l0eSc6IDAuMyxcclxuICAgICAgICAgICAgJ3BvaW50ZXItZXZlbnRzJzogJ25vbmUnLFxyXG4gICAgICAgICAgICBmaWxsOiAnbm9uZSdcclxuICAgICAgICB9LFxyXG4gICAgICAgIGNsb3NlQnV0dG9uOiBmdW5jdGlvbihwYXJlbnQpIHtcclxuICAgICAgICAgICAgcGFyZW50LmFwcGVuZCgnY2lyY2xlJylcclxuICAgICAgICAgICAgICAgIC5hdHRyKHtcclxuICAgICAgICAgICAgICAgICAgICByOiAxMCxcclxuICAgICAgICAgICAgICAgICAgICBmaWxsOiAnI2ZmZicsXHJcbiAgICAgICAgICAgICAgICAgICAgc3Ryb2tlOiAnIzAwMCcsXHJcbiAgICAgICAgICAgICAgICAgICAgJ3N0cm9rZS13aWR0aCc6IDIuNSxcclxuICAgICAgICAgICAgICAgICAgICAnc3Ryb2tlLW9wYWNpdHknOiAwLjksXHJcbiAgICAgICAgICAgICAgICAgICAgJ2ZpbGwtb3BhY2l0eSc6IDAuOSxcclxuICAgICAgICAgICAgICAgICAgICBjdXJzb3I6ICdwb2ludGVyJ1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgcGFyZW50LmFwcGVuZCgndGV4dCcpXHJcbiAgICAgICAgICAgICAgICAuYXR0cih7XHJcbiAgICAgICAgICAgICAgICAgICAgJ3RleHQtYW5jaG9yJzonbWlkZGxlJyxcclxuICAgICAgICAgICAgICAgICAgICBjdXJzb3I6ICdwb2ludGVyJyxcclxuICAgICAgICAgICAgICAgICAgICAnZm9udC13ZWlnaHQnOiAnYm9sZCcsXHJcbiAgICAgICAgICAgICAgICAgICAgJ2ZvbnQtc2l6ZSc6ICcxOCcsXHJcbiAgICAgICAgICAgICAgICAgICAgeTogNlxyXG4gICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgICAgIC50ZXh0KCfDlycpO1xyXG4gICAgICAgIH1cclxuICAgIH0sIG9wdGlvbnMpO1xyXG4gICAgICAgIFxyXG4gICAgdmFyIHJpbmcgPSBudWxsLFxyXG4gICAgICAgIG1hcCA9IG51bGwsXHJcbiAgICAgICAgciwgcjAsXHJcbiAgICAgICAgem9vbWVkID0gbnVsbDtcclxuICAgIFxyXG4gICAgdmFyIHogPSBmdW5jdGlvbihzZWxlY3Rpb24pIHtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgbWFwID0gdGhpcztcclxuXHJcbiAgICAgICAgdmFyIHNpemUgPSB0aGlzLnNpemUoKTtcclxuICAgICAgICBcclxuICAgICAgICByID0gTWF0aC5taW4oc2l6ZS5oZWlnaHQsIHNpemUud2lkdGgpIC8gMi4wICogb3B0aW9ucy5yaW5nUmFkaXVzO1xyXG4gICAgICAgIHIwID0gTWF0aC5zcXJ0KHNpemUud2lkdGgqc2l6ZS53aWR0aCArIHNpemUuaGVpZ2h0KnNpemUuaGVpZ2h0KSAvIDEuNTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgaWYgKCFvcHRpb25zLmNlbnRlcikge1xyXG4gICAgICAgICAgICAvLyB6b29tIHRvIGdsb2JhbGx5IHNldCBjZW50ZXIgYnkgZGVmYXVsdFxyXG4gICAgICAgICAgICBvcHRpb25zLmNlbnRlciA9IFtjZW50ZXIueCwgY2VudGVyLnldO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKG9wdGlvbnMuY3Vyc29yKSB7XHJcbiAgICAgICAgICAgIHNlbGVjdGlvbi5hdHRyKHtcclxuICAgICAgICAgICAgICAgIGN1cnNvcjogb3B0aW9ucy5jdXJzb3JcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChvcHRpb25zLnNob3dSaW5nICYmICFyaW5nKSB7XHJcbiAgICAgICAgICAgIHJpbmcgPSBtYXAuX2VsZW1lbnRzLmZpeGVkLnNlbGVjdEFsbCgnZy56b29tUmluZycpXHJcbiAgICAgICAgICAgICAgICAuZGF0YShbMV0pO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIG5ld3JpbmcgPSByaW5nLmVudGVyKClcclxuICAgICAgICAgICAgICAgIC5hcHBlbmQoJ2cnKVxyXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywnem9vbVJpbmcnKVxyXG4gICAgICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsJ3RyYW5zbGF0ZSgnICsgc2l6ZS53aWR0aCAqIG9wdGlvbnMuY2VudGVyWzBdICsgJywnICsgc2l6ZS5oZWlnaHQgKiBvcHRpb25zLmNlbnRlclsxXSArICcpJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIG5ld3JpbmcuYXBwZW5kKCdjaXJjbGUnKVxyXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ21haW4nKVxyXG4gICAgICAgICAgICAgICAgLmF0dHIoJ3InLCByMClcclxuICAgICAgICAgICAgICAgIC5hdHRyKG9wdGlvbnMucmluZ0F0dHJpYnV0ZXMpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBjbG9zZSA9IG5ld3JpbmcuYXBwZW5kKCdnJylcclxuICAgICAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsJ3pvb21PdXQnKVxyXG4gICAgICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsJ3RyYW5zbGF0ZSgnICsgKHIwICogMC43MDcpICsgJywtJyArIChyMCAqIDAuNzA3KSArICcpJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAob3B0aW9ucy5jbG9zZUJ1dHRvbikge1xyXG4gICAgICAgICAgICAgICAgb3B0aW9ucy5jbG9zZUJ1dHRvbihjbG9zZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyB0aGlzIGlzIGN1cnJlbnRseSBuZWVkZWQgaWYgZS5nLiBzZWFyY2ggem9vbXMgdG8gc29tZXdoZXJlIGVsc2UsXHJcbiAgICAgICAgLy8gYnV0IG1hcCBpcyBzdGlsbCB6b29tZWQgaW4gdGhyb3VnaCB0aGlzIGJlaGF2aW9yXHJcbiAgICAgICAgLy8gZG8gYSByZXNldCgpLCBidXQgd2l0aG91dCBtb2RpZnlpbmcgdGhlIG1hcCB2aWV3ICg9em9vbWluZyBvdXQpXHJcbiAgICAgICAgbWFwLm9uKCd2aWV3JywgZnVuY3Rpb24odHJhbnNsYXRlLCBzY2FsZSkge1xyXG4gICAgICAgICAgICBpZiAoem9vbWVkICYmIHNjYWxlID09IDEpIHtcclxuICAgICAgICAgICAgICAgIHpvb21lZCA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICBhbmltYXRlUmluZyhudWxsKTtcclxuICAgICAgICAgICAgICAgIG1hcC5fZWxlbWVudHMubWFwLnNlbGVjdCgnLmJhY2tncm91bmQnKS5vbihvcHRpb25zLmV2ZW50ICsgJy56b29tJywgbnVsbCk7XHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLnpvb21zdGFydCAmJiBvcHRpb25zLnpvb21zdGFydC5jYWxsKG1hcCwgbnVsbCk7XHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLnpvb21lbmQgJiYgb3B0aW9ucy56b29tZW5kLmNhbGwobWFwLCBudWxsKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgc2VsZWN0aW9uLm9uKG9wdGlvbnMuZXZlbnQsIGZ1bmN0aW9uKGQpIHtcclxuICAgICAgICAgICAgY2FsbEhvdmVyT3V0KCk7XHJcbiAgICAgICAgICAgIGlmICh6b29tZWQgPT0gdGhpcykge1xyXG4gICAgICAgICAgICAgICAgcmVzZXQoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHZhciBlbCA9IHRoaXM7XHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLnpvb21zdGFydCAmJiBvcHRpb25zLnpvb21zdGFydC5jYWxsKG1hcCwgZWwpO1xyXG4gICAgICAgICAgICAgICAgbWFwLnpvb21Ub1NlbGVjdGlvbih0aGlzLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2s6IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zLnpvb21lbmQgJiYgb3B0aW9ucy56b29tZW5kLmNhbGwobWFwLCBlbCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgICAgICBtYXhab29tOiBvcHRpb25zLm1heFpvb21cclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgYW5pbWF0ZVJpbmcodGhpcyk7XHJcbiAgICAgICAgICAgICAgICB6b29tZWQgPSB0aGlzO1xyXG4gICAgICAgICAgICAgICAgbWFwLl9lbGVtZW50cy5tYXAuc2VsZWN0KCcuYmFja2dyb3VuZCcpLm9uKG9wdGlvbnMuZXZlbnQgKyAnLnpvb20nLCByZXNldCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgaWYgKHpvb21lZCkge1xyXG4gICAgICAgICAgICBvcHRpb25zLnpvb21zdGFydCAmJiBvcHRpb25zLnpvb21zdGFydC5jYWxsKG1hcCwgem9vbWVkKTtcclxuICAgICAgICAgICAgb3B0aW9ucy56b29tZW5kICYmIG9wdGlvbnMuem9vbWVuZC5jYWxsKG1hcCwgem9vbWVkKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gem9vbVRvKHNlbGVjdGlvbikge1xyXG4gICAgICAgIG9wdGlvbnMuem9vbXN0YXJ0ICYmIG9wdGlvbnMuem9vbXN0YXJ0LmNhbGwobWFwLCBzZWxlY3Rpb24pO1xyXG4gICAgICAgIG1hcC56b29tVG9TZWxlY3Rpb24oc2VsZWN0aW9uLCB7XHJcbiAgICAgICAgICAgIGNhbGxiYWNrOiBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgIG9wdGlvbnMuem9vbWVuZCAmJiBvcHRpb25zLnpvb21lbmQuY2FsbChtYXAsIHNlbGVjdGlvbik7XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIG1heFpvb206IG9wdGlvbnMubWF4Wm9vbVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGFuaW1hdGVSaW5nKHNlbGVjdGlvbik7XHJcbiAgICAgICAgem9vbWVkID0gc2VsZWN0aW9uO1xyXG4gICAgICAgIG1hcC5fZWxlbWVudHMubWFwLnNlbGVjdCgnLmJhY2tncm91bmQnKS5vbihvcHRpb25zLmV2ZW50ICsgJy56b29tJywgcmVzZXQpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGFuaW1hdGVSaW5nKHNlbGVjdGlvbikge1xyXG4gICAgICAgIGlmIChyaW5nKSB7XHJcbiAgICAgICAgICAgIHZhciBuZXdfciA9IChzZWxlY3Rpb24pID8gciA6IHIwO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmluZy5zZWxlY3QoJ2NpcmNsZS5tYWluJykudHJhbnNpdGlvbigpLmR1cmF0aW9uKG9wdGlvbnMuYW5pbWF0aW9uRHVyYXRpb24pXHJcbiAgICAgICAgICAgICAgICAuYXR0cih7XHJcbiAgICAgICAgICAgICAgICAgICAgcjogbmV3X3JcclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIDtcclxuICAgICAgICAgICAgcmluZy5zZWxlY3QoJ2cuem9vbU91dCcpLnRyYW5zaXRpb24oKS5kdXJhdGlvbihvcHRpb25zLmFuaW1hdGlvbkR1cmF0aW9uKVxyXG4gICAgICAgICAgICAgICAgLmF0dHIoJ3RyYW5zZm9ybScsICd0cmFuc2xhdGUoJyArIChuZXdfciAqIDAuNzA3KSArICcsLScgKyAobmV3X3IgKiAwLjcwNykgKyAnKScpOyAvLyBzcXJ0KDIpIC8gMlxyXG5cclxuICAgICAgICAgICAgLy8gY2F2ZWF0OiBtYWtlIHN1cmUgdG8gYXNzaWduIHRoaXMgZXZlcnkgdGltZSB0byBhcHBseSBjb3JyZWN0IGNsb3N1cmUgaWYgd2UgaGF2ZSBtdWx0aXBsZSB6b29tIGJlaGF2aW9ycyEhXHJcbiAgICAgICAgICAgIHJpbmcuc2VsZWN0KCdnLnpvb21PdXQnKS5vbignY2xpY2snLCByZXNldCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgICAgIFxyXG4gICAgZnVuY3Rpb24gcmVzZXQoKSB7XHJcbiAgICAgICAgaWYgKG1hcCkge1xyXG4gICAgICAgICAgICB6b29tZWQgPSBudWxsO1xyXG4gICAgICAgICAgICBtYXAucmVzZXRab29tKCk7XHJcbiAgICAgICAgICAgIGFuaW1hdGVSaW5nKG51bGwpO1xyXG4gICAgICAgICAgICBtYXAuX2VsZW1lbnRzLm1hcC5zZWxlY3QoJy5iYWNrZ3JvdW5kJykub24ob3B0aW9ucy5ldmVudCArICcuem9vbScsIG51bGwpO1xyXG4gICAgICAgICAgICBpZiAob3B0aW9ucy56b29tc3RhcnQpIHtcclxuICAgICAgICAgICAgICAgIG9wdGlvbnMuem9vbXN0YXJ0LmNhbGwobWFwLCBudWxsKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAob3B0aW9ucy56b29tZW5kKSB7XHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLnpvb21lbmQuY2FsbChtYXAsIG51bGwpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICB6LnJlc2V0ID0gcmVzZXQ7XHJcbiAgICBcclxuICAgIHouYWN0aXZlID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgcmV0dXJuIHpvb21lZDtcclxuICAgIH07ICAgXHJcblxyXG4gICAgei5yZW1vdmUgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXNldCgpO1xyXG4gICAgfTtcclxuICAgICAgICBcclxuICAgIHouZnJvbSA9IGZ1bmN0aW9uKG90aGVyKXtcclxuICAgICAgICBpZiAob3RoZXIgJiYgb3RoZXIuYWN0aXZlKSB7XHJcbiAgICAgICAgICAgIHpvb21lZCA9IG90aGVyLmFjdGl2ZSgpO1xyXG4gICAgICAgICAgICAvKlxyXG4gICAgICAgICAgICBpZiAoem9vbWVkKSB7XHJcbiAgICAgICAgICAgICAgICB6b29tVG8oem9vbWVkKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAqL1xyXG4gICAgICAgICAgICAvLyBUT0RPOiBtYWtlIHVwIG91ciBtaW5kIHdoZXRoZXIgdGhpcyBzaG91bGQgcmVtb3ZlIHRoZSBvdGhlciBiZWhhdmlvclxyXG4gICAgICAgICAgICAvLyBpbiBidXJnZW5sYW5kX2RlbW9ncmFwaGllLmh0bWwsIHdlIG5lZWQgdG8ga2VlcCBpdCBhcyBpdCB3b3VsZCBvdGhlcndpc2Ugem9vbSBvdXRcclxuICAgICAgICAgICAgLy8gYnV0IGlmIHdlIG1peCBkaWZmZXJlbnQgYmVoYXZpb3JzLCB3ZSBtYXkgd2FudCB0byByZW1vdmUgdGhlIG90aGVyIG9uZSBhdXRvbWF0aWNhbGx5XHJcbiAgICAgICAgICAgIC8vIChvciBtYXliZSByZXF1aXJlIGl0IHRvIGJlIGRvbmUgbWFudWFsbHkpXHJcbiAgICAgICAgICAgIC8vIGluIHBlbmRlbG4uanMsIHdlIHJlbW92ZSB0aGUgb3RoZXIgYmVoYXZpb3IgaGVyZSwgd2hpY2ggaXMgaW5jb25zaXN0ZW50IVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy9vdGhlci5yZW1vdmUoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHo7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICByZXR1cm4gejtcclxufTtcclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuYW5pbWF0ZVZpZXcgPSBmdW5jdGlvbih0cmFuc2xhdGUsIHNjYWxlLCBjYWxsYmFjaywgZHVyYXRpb24pIHtcclxuXHJcbiAgICBkdXJhdGlvbiA9IGR1cmF0aW9uIHx8IDc1MDtcclxuICAgIFxyXG4gICAgaWYgKHRyYW5zbGF0ZVswXSA9PSB0aGlzLmN1cnJlbnRfdHJhbnNsYXRlWzBdICYmIHRyYW5zbGF0ZVsxXSA9PSB0aGlzLmN1cnJlbnRfdHJhbnNsYXRlWzFdICYmIHNjYWxlID09IHRoaXMuY3VycmVudF9zY2FsZSkge1xyXG4gICAgICAgIC8vIG5vdGhpbmcgdG8gZG9cclxuICAgICAgICAvLyB5aWVsZCB0byBzaW11bGF0ZSBhc3luYyBjYWxsYmFja1xyXG4gICAgICAgIGlmIChjYWxsYmFjaykge1xyXG4gICAgICAgICAgICB3aW5kb3cuc2V0VGltZW91dChjYWxsYmFjaywgMTApO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuICAgIHRoaXMuY3VycmVudF90cmFuc2xhdGUgPSB0cmFuc2xhdGU7XHJcbiAgICB0aGlzLmN1cnJlbnRfc2NhbGUgPSBzY2FsZTtcclxuICAgIGNhbGxIb3Zlck91dCgpO1xyXG4gICAgdmFyIG1hcCA9IHRoaXM7XHJcbiAgICB0aGlzLl9lbGVtZW50cy5tYXAudHJhbnNpdGlvbigpXHJcbiAgICAgICAgLmR1cmF0aW9uKGR1cmF0aW9uKVxyXG4gICAgICAgIC5jYWxsKG1hcC56b29tLnRyYW5zbGF0ZSh0cmFuc2xhdGUpLnNjYWxlKHNjYWxlKS5ldmVudClcclxuICAgICAgICAuZWFjaCgnc3RhcnQnLCBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgbWFwLl9lbGVtZW50cy5zaGFkb3dHcm91cC5hdHRyKCdkaXNwbGF5Jywnbm9uZScpO1xyXG4gICAgICAgIH0pXHJcbiAgICAgICAgLmVhY2goJ2VuZCcsIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICBtYXAuX2VsZW1lbnRzLnNoYWRvd0dyb3VwLmF0dHIoJ2Rpc3BsYXknLCdibG9jaycpO1xyXG4gICAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcclxuICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KVxyXG4gICAgICAgIC5lYWNoKCdpbnRlcnJ1cHQnLCBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgbWFwLl9lbGVtZW50cy5zaGFkb3dHcm91cC5hdHRyKCdkaXNwbGF5JywnYmxvY2snKTtcclxuICAgICAgICAgICAgLy8gbm90IHN1cmUgaWYgd2Ugc2hvdWxkIGNhbGwgY2FsbGJhY2sgaGVyZSwgYnV0IGl0IG1heSBiZSBub24taW50dWl0aXZlXHJcbiAgICAgICAgICAgIC8vIGZvciBjYWxsYmFjayB0byBuZXZlciBiZSBjYWxsZWQgaWYgem9vbSBpcyBjYW5jZWxsZWRcclxuICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSB7XHJcbiAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7ICAgICAgICBcclxuICAgIHRoaXMuZGlzcGF0Y2hlci52aWV3LmNhbGwodGhpcywgdHJhbnNsYXRlLCBzY2FsZSk7XHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuc2V0VmlldyA9IGZ1bmN0aW9uKHRyYW5zbGF0ZSwgc2NhbGUpIHtcclxuXHJcbiAgICB0cmFuc2xhdGUgPSB0cmFuc2xhdGUgfHwgdGhpcy5jdXJyZW50X3RyYW5zbGF0ZTtcclxuICAgIHNjYWxlID0gc2NhbGUgfHwgdGhpcy5jdXJyZW50X3NjYWxlO1xyXG4gICAgXHJcbiAgICB0aGlzLmN1cnJlbnRfdHJhbnNsYXRlID0gdHJhbnNsYXRlO1xyXG4gICAgdGhpcy5jdXJyZW50X3NjYWxlID0gc2NhbGU7XHJcbiAgICAgIFxyXG4gICAgLy8gZG8gd2UgbmVlZCB0aGlzP1xyXG4gICAgLy9jYWxsSG92ZXJPdXQoKTtcclxuXHJcbiAgICB0aGlzLnpvb20udHJhbnNsYXRlKHRyYW5zbGF0ZSkuc2NhbGUoc2NhbGUpLmV2ZW50KHRoaXMuX2VsZW1lbnRzLm1hcCk7XHJcblxyXG4gICAgdGhpcy5kaXNwYXRjaGVyLnZpZXcuY2FsbCh0aGlzLCB0cmFuc2xhdGUsIHNjYWxlKTtcclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5nZXRWaWV3ID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHRyYW5zbGF0ZTogdGhpcy5jdXJyZW50X3RyYW5zbGF0ZSxcclxuICAgICAgICBzY2FsZTogdGhpcy5jdXJyZW50X3NjYWxlXHJcbiAgICB9XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLnpvb21Ub1NlbGVjdGlvbiA9IGZ1bmN0aW9uKHNlbGVjdGlvbiwgb3B0aW9ucykge1xyXG4gICAgXHJcbiAgICBvcHRpb25zID0gZGQubWVyZ2Uoe1xyXG4gICAgICAgIGZpdFNjYWxlOiAwLjcsXHJcbiAgICAgICAgYW5pbWF0aW9uRHVyYXRpb246IDc1MCxcclxuICAgICAgICBtYXhab29tOiA4XHJcbiAgICB9LCBvcHRpb25zKTtcclxuXHJcbiAgICB2YXIgc2VsID0gdGhpcy5nZXRSZXByZXNlbnRhdGlvbnMoc2VsZWN0aW9uKSxcclxuICAgICAgICBib3VuZHMgPSBbW0luZmluaXR5LEluZmluaXR5XSxbLUluZmluaXR5LCAtSW5maW5pdHldXSxcclxuICAgICAgICBwYXRoR2VuZXJhdG9yID0gZDMuZ2VvLnBhdGgoKS5wcm9qZWN0aW9uKHRoaXMuX3Byb2plY3Rpb24pOyAgICBcclxuICAgIFxyXG4gICAgc2VsLmVhY2goZnVuY3Rpb24oZWwpe1xyXG4gICAgICAgIHZhciBiID0gcGF0aEdlbmVyYXRvci5ib3VuZHMoZWwpO1xyXG4gICAgICAgIGJvdW5kc1swXVswXSA9IE1hdGgubWluKGJvdW5kc1swXVswXSwgYlswXVswXSk7XHJcbiAgICAgICAgYm91bmRzWzBdWzFdID0gTWF0aC5taW4oYm91bmRzWzBdWzFdLCBiWzBdWzFdKTtcclxuICAgICAgICBib3VuZHNbMV1bMF0gPSBNYXRoLm1heChib3VuZHNbMV1bMF0sIGJbMV1bMF0pO1xyXG4gICAgICAgIGJvdW5kc1sxXVsxXSA9IE1hdGgubWF4KGJvdW5kc1sxXVsxXSwgYlsxXVsxXSk7XHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgdmFyIGR4ID0gYm91bmRzWzFdWzBdIC0gYm91bmRzWzBdWzBdLFxyXG4gICAgICAgIGR5ID0gYm91bmRzWzFdWzFdIC0gYm91bmRzWzBdWzFdLFxyXG4gICAgICAgIHggPSAoYm91bmRzWzBdWzBdICsgYm91bmRzWzFdWzBdKSAvIDIsXHJcbiAgICAgICAgeSA9IChib3VuZHNbMF1bMV0gKyBib3VuZHNbMV1bMV0pIC8gMixcclxuICAgICAgICBzaXplID0gdGhpcy5zaXplKCksXHJcbiAgICAgICAgc2NhbGUgPSBNYXRoLm1pbihvcHRpb25zLm1heFpvb20sIG9wdGlvbnMuZml0U2NhbGUgLyBNYXRoLm1heChkeCAvIHNpemUud2lkdGgsIGR5IC8gc2l6ZS5oZWlnaHQpKSxcclxuICAgICAgICB0cmFuc2xhdGUgPSBbc2l6ZS53aWR0aCAqIGNlbnRlci54IC0gc2NhbGUgKiB4LCBzaXplLmhlaWdodCAqIGNlbnRlci55IC0gc2NhbGUgKiB5XTtcclxuICAgIHRoaXMuYW5pbWF0ZVZpZXcodHJhbnNsYXRlLCBzY2FsZSwgb3B0aW9ucy5jYWxsYmFjaywgb3B0aW9ucy5hbmltYXRpb25EdXJhdGlvbik7XHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuem9vbVRvQm91bmRzID0gZnVuY3Rpb24oYm91bmRzLCBjYWxsYmFjaywgZHVyYXRpb24pIHtcclxuICAgIHZhciB3ID0gYm91bmRzWzFdWzBdLWJvdW5kc1swXVswXSxcclxuICAgICAgICBoID0gYm91bmRzWzFdWzFdLWJvdW5kc1swXVsxXSxcclxuICAgICAgICBjeCA9IChib3VuZHNbMV1bMF0rYm91bmRzWzBdWzBdKSAvIDIsXHJcbiAgICAgICAgY3kgPSAoYm91bmRzWzFdWzFdK2JvdW5kc1swXVsxXSkgLyAyLFxyXG4gICAgICAgIHNpemUgPSB0aGlzLnNpemUoKSxcclxuICAgICAgICBzY2FsZSA9IE1hdGgubWluKDIsIDAuOSAvIE1hdGgubWF4KHcgLyBzaXplLndpZHRoLCBoIC8gc2l6ZS5oZWlnaHQpKSxcclxuICAgICAgICB0cmFuc2xhdGUgPSBbc2l6ZS53aWR0aCAqIDAuNSAtIHNjYWxlICogY3gsIHNpemUuaGVpZ2h0ICogMC41IC0gc2NhbGUgKiBjeV07XHJcbiAgICBcclxuICAgIHJldHVybiB0aGlzLmFuaW1hdGVWaWV3KHRyYW5zbGF0ZSwgc2NhbGUsIGNhbGxiYWNrLCBkdXJhdGlvbik7XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLnpvb21Ub0NlbnRlciA9IGZ1bmN0aW9uKGNlbnRlciwgc2NhbGUsIGNhbGxiYWNrLCBkdXJhdGlvbikge1xyXG5cclxuICAgIHNjYWxlID0gc2NhbGUgfHwgMTtcclxuICAgIFxyXG4gICAgdmFyIHNpemUgPSB0aGlzLnNpemUoKSxcclxuICAgICAgICB0cmFuc2xhdGUgPSBbc2l6ZS53aWR0aCAqIDAuNSAtIHNjYWxlICogY2VudGVyWzBdLCBzaXplLmhlaWdodCAqIDAuNSAtIHNjYWxlICogY2VudGVyWzFdXTtcclxuXHJcbiAgICByZXR1cm4gdGhpcy5hbmltYXRlVmlldyh0cmFuc2xhdGUsIHNjYWxlLCBjYWxsYmFjaywgZHVyYXRpb24pO1xyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS56b29tVG9WaWV3cG9ydFBvc2l0aW9uID0gZnVuY3Rpb24oY2VudGVyLCBzY2FsZSwgY2FsbGJhY2ssIGR1cmF0aW9uKSB7XHJcblxyXG4gICAgdmFyIHBvaW50ID0gdGhpcy5fZWxlbWVudHMubWFpbi5ub2RlKCkuY3JlYXRlU1ZHUG9pbnQoKTtcclxuXHJcbiAgICBwb2ludC54ID0gY2VudGVyWzBdO1xyXG4gICAgcG9pbnQueSA9IGNlbnRlclsxXTtcclxuXHJcbiAgICB2YXIgY3RtID0gdGhpcy5fZWxlbWVudHMuZ2VvbWV0cnkubm9kZSgpLmdldFNjcmVlbkNUTSgpLmludmVyc2UoKTtcclxuICAgIHBvaW50ID0gcG9pbnQubWF0cml4VHJhbnNmb3JtKGN0bSk7XHJcblxyXG4gICAgcG9pbnQgPSBbcG9pbnQueCwgcG9pbnQueV07XHJcbiAgICBcclxuICAgIHNjYWxlID0gc2NhbGUgfHwgMTtcclxuICAgIFxyXG4gICAgLy92YXIgcG9pbnQgPSBbKGNlbnRlclswXS10aGlzLmN1cnJlbnRfdHJhbnNsYXRlWzBdKS90aGlzLmN1cnJlbnRfc2NhbGUsIChjZW50ZXJbMV0tdGhpcy5jdXJyZW50X3RyYW5zbGF0ZVsxXSkvdGhpcy5jdXJyZW50X3NjYWxlXTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHRoaXMuem9vbVRvQ2VudGVyKHBvaW50LCBzY2FsZSwgY2FsbGJhY2ssIGR1cmF0aW9uKTtcclxufTtcclxuXHJcbm1hcG1hcC5wcm90b3R5cGUucmVzZXRab29tID0gZnVuY3Rpb24oY2FsbGJhY2ssIGR1cmF0aW9uKSB7XHJcbiAgICByZXR1cm4gdGhpcy5hbmltYXRlVmlldyhbMCwwXSwxLCBjYWxsYmFjaywgZHVyYXRpb24pO1xyXG4gICAgLy8gVE9ETyB0YWtlIGNlbnRlciBpbnRvIGFjY291bnQgem9vbWVkLW91dCwgd2UgbWF5IG5vdCBhbHdheXMgd2FudCB0aGlzP1xyXG4gICAgLy9kb1pvb20oW3dpZHRoICogKGNlbnRlci54LTAuNSksaGVpZ2h0ICogKGNlbnRlci55LTAuNSldLDEpO1xyXG59O1xyXG5cclxuXHJcbi8vIE1hbmlwdWxhdGUgcmVwcmVzZW50YXRpb24gZ2VvbWV0cnkuIFRoaXMgY2FuIGJlIHVzZWQgZS5nLiB0byByZWdpc3RlciBldmVudCBoYW5kbGVycy5cclxuLy8gc3BlYyBpcyBhIGZ1bmN0aW9uIHRvIGJlIGNhbGxlZCB3aXRoIHNlbGVjdGlvbiB0byBzZXQgdXAgZXZlbnQgaGFuZGxlclxyXG5tYXBtYXAucHJvdG90eXBlLmFwcGx5QmVoYXZpb3IgPSBmdW5jdGlvbihzcGVjLCBzZWxlY3Rpb24pIHtcclxuICAgIHZhciBtYXAgPSB0aGlzO1xyXG4gICAgdGhpcy5fcHJvbWlzZS5nZW9tZXRyeS50aGVuKGZ1bmN0aW9uKHRvcG8pIHtcclxuICAgICAgICB2YXIgc2VsID0gbWFwLmdldFJlcHJlc2VudGF0aW9ucyhzZWxlY3Rpb24pO1xyXG4gICAgICAgIGlmICh0eXBlb2Ygc3BlYyA9PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgIHNwZWMuY2FsbChtYXAsIHNlbCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICB0aHJvdyBcIkJlaGF2aW9yIFwiICsgc3BlYyArIFwiIG5vdCBhIGZ1bmN0aW9uXCI7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcblxyXG4vLyBhcHBseSBhIGJlaGF2aW9yIG9uIHRoZSB3aG9sZSBtYXAgcGFuZSAoZS5nLiBkcmFnL3pvb20gZXRjLilcclxubWFwbWFwLnByb3RvdHlwZS5hcHBseU1hcEJlaGF2aW9yID0gZnVuY3Rpb24oc3BlYykge1xyXG4gICAgc3BlYy5jYWxsKHRoaXMsIHRoaXMuX2VsZW1lbnRzLm1hcCk7XHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcblxyXG4vLyBkZXByZWNhdGVkIG1ldGhvZHMgdXNpbmcgVUstc3BlbGxpbmdcclxubWFwbWFwLnByb3RvdHlwZS5hcHBseUJlaGF2aW91ciA9IGZ1bmN0aW9uKHNwZWMsIHNlbGVjdGlvbikge1xyXG4gICAgY29uc29sZSAmJiBjb25zb2xlLmxvZyAmJiBjb25zb2xlLmxvZyhcIkRlcHJlY2F0aW9uIHdhcm5pbmc6IGFwcGx5QmVoYXZpb3VyKCkgaXMgZGVwcmVjYXRlZCwgdXNlIGFwcGx5QmVoYXZpb3IoKSAoVVMgc3BlbGxpbmcpIGluc3RlYWQhXCIpO1xyXG4gICAgcmV0dXJuIHRoaXMuYXBwbHlCZWhhdmlvcihzcGVjLCBzZWxlY3Rpb24pO1xyXG59XHJcbm1hcG1hcC5wcm90b3R5cGUuYXBwbHlNYXBCZWhhdmlvdXIgPSBmdW5jdGlvbihzcGVjLCBzZWxlY3Rpb24pIHtcclxuICAgIGNvbnNvbGUgJiYgY29uc29sZS5sb2cgJiYgY29uc29sZS5sb2coXCJEZXByZWNhdGlvbiB3YXJuaW5nOiBhcHBseU1hcEJlaGF2aW91cigpIGlzIGRlcHJlY2F0ZWQsIHVzZSBhcHBseU1hcEJlaGF2aW9yKCkgKFVTIHNwZWxsaW5nKSBpbnN0ZWFkIVwiKTtcclxuICAgIHJldHVybiB0aGlzLmFwcGx5TWFwQmVoYXZpb3Ioc3BlYywgc2VsZWN0aW9uKTtcclxufVxyXG5cclxuLy8gaGFuZGxlciBmb3IgaGlnaC1sZXZlbCBldmVudHMgb24gdGhlIG1hcCBvYmplY3RcclxubWFwbWFwLnByb3RvdHlwZS5vbiA9IGZ1bmN0aW9uKGV2ZW50TmFtZSwgaGFuZGxlcikge1xyXG4gICAgdGhpcy5kaXNwYXRjaGVyLm9uKGV2ZW50TmFtZSwgaGFuZGxlcik7XHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbmZ1bmN0aW9uIGRlZmF1bHRSYW5nZUxhYmVsKGEsIGIsIGZvcm1hdCwgZXhjbHVkZUxvd2VyKSB7XHJcbiAgICBmb3JtYXQgPSBmb3JtYXQgfHwgZnVuY3Rpb24oYSl7cmV0dXJuIGF9O1xyXG4gICAgdmFyIGxvd2VyID0gZXhjbHVkZUxvd2VyID8gJz4gJyA6ICcnO1xyXG4gICAgaWYgKGlzTmFOKGEpICYmICFpc05hTihiKSkge1xyXG4gICAgICAgIHJldHVybiBcInVwIHRvIFwiICsgZm9ybWF0KGIpO1xyXG4gICAgfVxyXG4gICAgaWYgKGlzTmFOKGIpICYmICFpc05hTihhKSkge1xyXG4gICAgICAgIHJldHVybiBsb3dlciArIGZvcm1hdChhKSArIFwiIGFuZCBhYm92ZVwiO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIChsb3dlciArIGZvcm1hdChhKSArIFwiIHRvIFwiICsgZm9ybWF0KGIpKTtcclxufVxyXG5cclxudmFyIGQzX2xvY2FsZXMgPSB7XHJcbiAgICAnZW4nOiB7XHJcbiAgICAgICAgZGVjaW1hbDogXCIuXCIsXHJcbiAgICAgICAgdGhvdXNhbmRzOiBcIixcIixcclxuICAgICAgICBncm91cGluZzogWyAzIF0sXHJcbiAgICAgICAgY3VycmVuY3k6IFsgXCIkXCIsIFwiXCIgXSxcclxuICAgICAgICBkYXRlVGltZTogXCIlYSAlYiAlZSAlWCAlWVwiLFxyXG4gICAgICAgIGRhdGU6IFwiJW0vJWQvJVlcIixcclxuICAgICAgICB0aW1lOiBcIiVIOiVNOiVTXCIsXHJcbiAgICAgICAgcGVyaW9kczogWyBcIkFNXCIsIFwiUE1cIiBdLFxyXG4gICAgICAgIGRheXM6IFsgXCJTdW5kYXlcIiwgXCJNb25kYXlcIiwgXCJUdWVzZGF5XCIsIFwiV2VkbmVzZGF5XCIsIFwiVGh1cnNkYXlcIiwgXCJGcmlkYXlcIiwgXCJTYXR1cmRheVwiIF0sXHJcbiAgICAgICAgc2hvcnREYXlzOiBbIFwiU3VuXCIsIFwiTW9uXCIsIFwiVHVlXCIsIFwiV2VkXCIsIFwiVGh1XCIsIFwiRnJpXCIsIFwiU2F0XCIgXSxcclxuICAgICAgICBtb250aHM6IFsgXCJKYW51YXJ5XCIsIFwiRmVicnVhcnlcIiwgXCJNYXJjaFwiLCBcIkFwcmlsXCIsIFwiTWF5XCIsIFwiSnVuZVwiLCBcIkp1bHlcIiwgXCJBdWd1c3RcIiwgXCJTZXB0ZW1iZXJcIiwgXCJPY3RvYmVyXCIsIFwiTm92ZW1iZXJcIiwgXCJEZWNlbWJlclwiIF0sXHJcbiAgICAgICAgc2hvcnRNb250aHM6IFsgXCJKYW5cIiwgXCJGZWJcIiwgXCJNYXJcIiwgXCJBcHJcIiwgXCJNYXlcIiwgXCJKdW5cIiwgXCJKdWxcIiwgXCJBdWdcIiwgXCJTZXBcIiwgXCJPY3RcIiwgXCJOb3ZcIiwgXCJEZWNcIiBdLFxyXG4gICAgICAgIHJhbmdlTGFiZWw6IGRlZmF1bHRSYW5nZUxhYmVsXHJcbiAgICB9LFxyXG4gICAgJ2RlJzoge1xyXG4gICAgICAgIGRlY2ltYWw6IFwiLFwiLFxyXG4gICAgICAgIHRob3VzYW5kczogXCIuXCIsXHJcbiAgICAgICAgZ3JvdXBpbmc6IFszXSxcclxuICAgICAgICBjdXJyZW5jeTogW1wi4oKsXCIsIFwiXCJdLFxyXG4gICAgICAgIGRhdGVUaW1lOiBcIiVhICViICVlICVYICVZXCIsXHJcbiAgICAgICAgZGF0ZTogXCIlZC4lbS4lWVwiLFxyXG4gICAgICAgIHRpbWU6IFwiJUg6JU06JVNcIixcclxuICAgICAgICBwZXJpb2RzOiBbXCJBTVwiLCBcIlBNXCJdLFxyXG4gICAgICAgIGRheXM6IFtcIlNvbm50YWdcIiwgXCJNb250YWdcIiwgXCJEaWVuc3RhZ1wiLCBcIk1pdHR3b2NoXCIsIFwiRG9ubmVyc3RhZ1wiLCBcIkZyZWl0YWdcIiwgXCJTYW1zdGFnXCJdLFxyXG4gICAgICAgIHNob3J0RGF5czogW1wiU29cIiwgXCJNb1wiLCBcIkRpXCIsIFwiTWlcIiwgXCJEb1wiLCBcIkZyXCIsIFwiU2FcIl0sXHJcbiAgICAgICAgbW9udGhzOiBbXCJKw6RubmVyXCIsIFwiRmVicnVhclwiLCBcIk3DpHJ6XCIsIFwiQXByaWxcIiwgXCJNYWlcIiwgXCJKdW5pXCIsIFwiSnVsaVwiLCBcIkF1Z3VzdFwiLCBcIlNlcHRlbWJlclwiLCBcIk9rdG9iZXJcIiwgXCJOb3ZlbWJlclwiLCBcIkRlemVtYmVyXCJdLFxyXG4gICAgICAgIHNob3J0TW9udGhzOiBbXCJKYW4uXCIsIFwiRmViLlwiLCBcIk3DpHJ6XCIsIFwiQXByLlwiLCBcIk1haVwiLCBcIkp1bmlcIiwgXCJKdWxpXCIsIFwiQXVnLlwiLCBcIlNlcC5cIiwgXCJPa3QuXCIsIFwiTm92LlwiLCBcIkRlei5cIl0sXHJcbiAgICAgICAgcmFuZ2VMYWJlbDogZnVuY3Rpb24oYSwgYiwgZm9ybWF0LCBleGNsdWRlTG93ZXIpIHtcclxuICAgICAgICAgICAgZm9ybWF0ID0gZm9ybWF0IHx8IGZ1bmN0aW9uKGEpe3JldHVybiBhfTtcclxuICAgICAgICAgICAgdmFyIGxvd2VyID0gZXhjbHVkZUxvd2VyID8gJz4gJyA6ICcnO1xyXG4gICAgICAgICAgICBpZiAoaXNOYU4oYSkgJiYgIWlzTmFOKGIpKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gXCJiaXMgenUgXCIgKyBmb3JtYXQoYik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKGlzTmFOKGIpICYmICFpc05hTihhKSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGxvd2VyICsgZm9ybWF0KGEpICsgXCIgdW5kIG1laHJcIjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gKGxvd2VyICsgZm9ybWF0KGEpICsgXCIgYmlzIFwiICsgZm9ybWF0KGIpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn07XHJcblxyXG52YXIgb3B0aW9uc0xpc3RlbmVycyA9IHtcclxuICAgICdsb2NhbGUnOiBmdW5jdGlvbih2YWwsIG9sZF92YWwpIHtcclxuICAgICAgICB0aGlzLnNldExvY2FsZSh2YWwpO1xyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5zZXRMb2NhbGUgPSBmdW5jdGlvbihsYW5nKXtcclxuICAgIHZhciBsb2NhbGU7XHJcbiAgICBpZiAoZGQuaXNTdHJpbmcobGFuZykgJiYgZDNfbG9jYWxlc1tsYW5nXSkge1xyXG4gICAgICAgIGxvY2FsZSA9IGQzX2xvY2FsZXNbbGFuZ107XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgICBsb2NhbGUgPSBsYW5nO1xyXG4gICAgfVxyXG4gICAgdGhpcy5sb2NhbGUgPSBkMy5sb2NhbGUobG9jYWxlKTtcclxuICAgIC8vIEhBQ0s6IHdlIGNhbm5vdCBleHRlbmQgZDMgbG9jYWxlIHByb3Blcmx5XHJcbiAgICB0aGlzLmxvY2FsZS5yYW5nZUxhYmVsID0gbG9jYWxlLnJhbmdlTGFiZWw7XHJcbiAgICBcclxuICAgIHJldHVybiB0aGlzO1xyXG59XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLm9wdGlvbnMgPSBmdW5jdGlvbihzcGVjLCB2YWx1ZSkge1xyXG4gICAgLy8gZ2V0L3NldCBpbmRleGVkIHByb3BlcnR5XHJcbiAgICAvLyBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vYS82Mzk0MTY4LzE3MTU3OVxyXG4gICAgZnVuY3Rpb24gcHJvcGVydHlEZWVwKG9iaiwgaXMsIHZhbHVlKSB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiBpcyA9PSAnc3RyaW5nJylcclxuICAgICAgICAgICAgcmV0dXJuIHByb3BlcnR5RGVlcChvYmosaXMuc3BsaXQoJy4nKSwgdmFsdWUpO1xyXG4gICAgICAgIGVsc2UgaWYgKGlzLmxlbmd0aD09MSAmJiB2YWx1ZSE9PXVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBvYmpbaXNbMF1dID0gdmFsdWU7XHJcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSBpZiAoaXMubGVuZ3RoPT0wKVxyXG4gICAgICAgICAgICByZXR1cm4gb2JqO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgcmV0dXJuIHByb3BlcnR5RGVlcChvYmpbaXNbMF1dLGlzLnNsaWNlKDEpLCB2YWx1ZSk7XHJcbiAgICB9XHJcbiAgICBpZiAodHlwZW9mIHNwZWMgPT0gJ3N0cmluZycpIHtcclxuICAgICAgICBpZiAob3B0aW9uc0xpc3RlbmVyc1tzcGVjXSkge1xyXG4gICAgICAgICAgICBvcHRpb25zTGlzdGVuZXJzW3NwZWNdLmNhbGwodGhpcywgdmFsdWUsIHByb3BlcnR5RGVlcCh0aGlzLnNldHRpbmdzLCBzcGVjLCB2YWx1ZSkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgcHJvcGVydHlEZWVwKHRoaXMuc2V0dGluZ3MsIHNwZWMsIHZhbHVlKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgICB2YXIgb2xkID0gbWFwbWFwLmV4dGVuZCh0cnVlLCB7fSwgdGhpcy5zZXR0aW5ncyk7XHJcbiAgICAgICAgbWFwbWFwLmV4dGVuZCh0cnVlLCB0aGlzLnNldHRpbmdzLCBzcGVjKTtcclxuICAgICAgICAvLyBUT0RPOiB0aGlzIGlzIHF1aXRlIGluZWZmaWNpZW50LCBzaG91bGQgYmUgaW50ZWdyYXRlZCBpbnRvIGEgY3VzdG9tIGV4dGVuZCgpIGZ1bmN0aW9uXHJcbiAgICAgICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhvcHRpb25zTGlzdGVuZXJzKTtcclxuICAgICAgICBmb3IgKHZhciBpPTA7IGk8a2V5cy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICB2YXIgYSA9IHByb3BlcnR5RGVlcChvbGQsIGtleXNbaV0pLFxyXG4gICAgICAgICAgICAgICAgYiA9IHByb3BlcnR5RGVlcCh0aGlzLnNldHRpbmdzLCBrZXlzW2ldKTtcclxuICAgICAgICAgICAgaWYgKGEgIT09IGIpIHtcclxuICAgICAgICAgICAgICAgIG9wdGlvbnNMaXN0ZW5lcnNba2V5c1tpXV0uY2FsbCh0aGlzLCBiLCBhKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgIH1cclxuICAgIC8vc2V0dGluZ3MubGVnZW5kT3B0aW9ucy5jb250YWluZXJBdHRyaWJ1dGVzLnRyYW5zZm9ybSA9IHZhbHVlO1xyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLmxlZ2VuZCA9IGZ1bmN0aW9uKGxlZ2VuZF9mdW5jKSB7XHJcbiAgICB0aGlzLmxlZ2VuZF9mdW5jID0gbGVnZW5kX2Z1bmM7XHJcbiAgICByZXR1cm4gdGhpcztcclxufVxyXG5tYXBtYXAucHJvdG90eXBlLnVwZGF0ZUxlZ2VuZCA9IGZ1bmN0aW9uKHZhbHVlLCBtZXRhZGF0YSwgc2NhbGUsIHNlbGVjdGlvbikge1xyXG5cclxuICAgIGlmICghdGhpcy5sZWdlbmRfZnVuYyB8fCAhc2NhbGUpIHtcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKHR5cGVvZiBtZXRhZGF0YSA9PSAnc3RyaW5nJykge1xyXG4gICAgICAgIG1ldGFkYXRhID0gbWFwbWFwLmdldE1ldGFkYXRhKG1ldGFkYXRhKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdmFyIHJhbmdlID0gc2NhbGUucmFuZ2UoKS5zbGljZSgwKSwgLy8gY2xvbmUsIHdlIG1pZ2h0IHJldmVyc2UoKSBsYXRlclxyXG4gICAgICAgIGxhYmVsRm9ybWF0LFxyXG4gICAgICAgIHRocmVzaG9sZHM7XHJcbiAgICAgICAgXHJcbiAgICB2YXIgbWFwID0gdGhpcztcclxuXHJcbiAgICAvLyBzZXQgdXAgbGFiZWxzIGFuZCBoaXN0b2dyYW0gYmlucyBhY2NvcmRpbmcgdG8gc2NhbGVcclxuICAgIGlmIChzY2FsZS5pbnZlcnRFeHRlbnQpIHtcclxuICAgICAgICAvLyBmb3IgcXVhbnRpemF0aW9uIHNjYWxlcyB3ZSBoYXZlIGludmVydEV4dGVudCB0byBmdWxseSBzcGVjaWZ5IGJpbnNcclxuICAgICAgICBsYWJlbEZvcm1hdCA9IGZ1bmN0aW9uKGQsaSkge1xyXG4gICAgICAgICAgICB2YXIgZXh0ZW50ID0gc2NhbGUuaW52ZXJ0RXh0ZW50KGQpO1xyXG4gICAgICAgICAgICBpZiAobWFwLmxvY2FsZSAmJiBtYXAubG9jYWxlLnJhbmdlTGFiZWwpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBtYXAubG9jYWxlLnJhbmdlTGFiZWwoZXh0ZW50WzBdLCBleHRlbnRbMV0sIG1ldGFkYXRhLmZvcm1hdC5iaW5kKG1ldGFkYXRhKSwgKGk8cmFuZ2UubGVuZ3RoLTEpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gZGVmYXVsdFJhbmdlTGFiZWwoZXh0ZW50WzBdLCBleHRlbnRbMV0sIG1ldGFkYXRhLmZvcm1hdC5iaW5kKG1ldGFkYXRhKSwgKGk8cmFuZ2UubGVuZ3RoLTEpKTtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG4gICAgZWxzZSB7XHJcbiAgICAgICAgLy8gb3JkaW5hbCBzY2FsZXNcclxuICAgICAgICBsYWJlbEZvcm1hdCA9IG1ldGFkYXRhLmdldEZvcm1hdHRlcigpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB2YXIgaGlzdG9ncmFtID0gbnVsbDtcclxuXHJcbiAgICBpZiAoc2NhbGUuaW52ZXJ0RXh0ZW50KSB7XHJcbiAgICAgICAgdmFyIGhpc3RfcmFuZ2UgPSBzY2FsZS5yYW5nZSgpO1xyXG4gICAgICAgIHRocmVzaG9sZHMgPSBbc2NhbGUuaW52ZXJ0RXh0ZW50KGhpc3RfcmFuZ2VbMF0pWzBdXTtcclxuICAgICAgICBmb3IgKHZhciBpPTA7IGk8aGlzdF9yYW5nZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICB2YXIgZXh0ZW50ID0gc2NhbGUuaW52ZXJ0RXh0ZW50KGhpc3RfcmFuZ2VbaV0pO1xyXG4gICAgICAgICAgICB0aHJlc2hvbGRzLnB1c2goZXh0ZW50WzFdKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgICAvLyBvcmRpbmFsIHNjYWxlc1xyXG4gICAgICAgIHRocmVzaG9sZHMgPSByYW5nZS5sZW5ndGg7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHZhciBoaXN0b2dyYW1fb2JqZWN0cyA9IHRoaXMuZ2V0UmVwcmVzZW50YXRpb25zKHNlbGVjdGlvbilbMF07XHJcbiAgICBcclxuICAgIHZhciBtYWtlX2hpc3RvZ3JhbSA9IGQzLmxheW91dC5oaXN0b2dyYW0oKVxyXG4gICAgICAgIC5iaW5zKHRocmVzaG9sZHMpXHJcbiAgICAgICAgLnZhbHVlKGZ1bmN0aW9uKGQpe1xyXG4gICAgICAgICAgICByZXR1cm4gZC5fX2RhdGFfXy5wcm9wZXJ0aWVzW3ZhbHVlXTtcclxuICAgICAgICB9KVxyXG4gICAgICAgIC8vIHVzZSBcImRlbnNpdHlcIiBtb2RlLCBnaXZpbmcgdXMgaGlzdG9ncmFtIHkgdmFsdWVzIGluIHRoZSByYW5nZSBvZiBbMC4uMV1cclxuICAgICAgICAuZnJlcXVlbmN5KGZhbHNlKTtcclxuXHJcbiAgICBoaXN0b2dyYW0gPSBtYWtlX2hpc3RvZ3JhbShoaXN0b2dyYW1fb2JqZWN0cyk7XHJcbiAgICBcclxuICAgIHRoaXMubGVnZW5kX2Z1bmMuY2FsbCh0aGlzLCB2YWx1ZSwgbWV0YWRhdGEsIHJhbmdlLCBsYWJlbEZvcm1hdCwgaGlzdG9ncmFtKTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgIHJldHVybiB0aGlzO1xyXG5cclxufTtcclxuXHJcbmZ1bmN0aW9uIHZhbHVlT3JDYWxsKHNwZWMpIHtcclxuICAgIGlmICh0eXBlb2Ygc3BlYyA9PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgcmV0dXJuIHNwZWMuYXBwbHkodGhpcywgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gc3BlYztcclxufVxyXG5cclxuLy8gbmFtZXNwYWNlIGZvciBsZWdlbmQgZ2VuZXJhdGlvbiBmdW5jdGlvbnNcclxubWFwbWFwLmxlZ2VuZCA9IHt9O1xyXG5cclxubWFwbWFwLmxlZ2VuZC5odG1sID0gZnVuY3Rpb24ob3B0aW9ucykge1xyXG5cclxuICAgIHZhciBERUZBVUxUUyA9IHtcclxuICAgICAgICBsZWdlbmRDbGFzc05hbWU6ICdtYXBMZWdlbmQnLFxyXG4gICAgICAgIGxlZ2VuZFN0eWxlOiB7fSxcclxuICAgICAgICBjZWxsU3R5bGU6IHt9LFxyXG4gICAgICAgIGNvbG9yQm94U3R5bGU6IHtcclxuICAgICAgICAgICAgb3ZlcmZsb3c6ICdoaWRkZW4nLFxyXG4gICAgICAgICAgICBkaXNwbGF5OiAnaW5saW5lLWJsb2NrJyxcclxuICAgICAgICAgICAgd2lkdGg6ICczZW0nLFxyXG4gICAgICAgICAgICBoZWlnaHQ6ICcxLjVlbScsXHJcbiAgICAgICAgICAgICd2ZXJ0aWNhbC1hbGlnbic6ICctMC41ZW0nLFxyXG4gICAgICAgICAgICAvL2JvcmRlcjogJzFweCBzb2xpZCAjNDQ0NDQ0JyxcclxuICAgICAgICAgICAgbWFyZ2luOiAnMCAwLjVlbSAwLjJlbSAwJ1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgY29sb3JGaWxsU3R5bGU6IHtcclxuICAgICAgICAgICAgd2lkdGg6ICcwJyxcclxuICAgICAgICAgICAgaGVpZ2h0OiAnMCcsXHJcbiAgICAgICAgICAgICdib3JkZXItd2lkdGgnOiAnMTAwcHgnLFxyXG4gICAgICAgICAgICAnYm9yZGVyLXN0eWxlJzogJ3NvbGlkJyxcclxuICAgICAgICAgICAgJ2JvcmRlci1jb2xvcic6ICcjZmZmZmZmJ1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgaGlzdG9ncmFtQmFyU3R5bGU6IHt9LFxyXG4gICAgICAgIHRleHRTdHlsZToge31cclxuICAgIH07XHJcbiAgICBcclxuICAgIG9wdGlvbnMgPSBtYXBtYXAuZXh0ZW5kKERFRkFVTFRTLCBvcHRpb25zKTtcclxuICAgIFxyXG4gICAgcmV0dXJuIGZ1bmN0aW9uKHZhbHVlLCBtZXRhZGF0YSwgcmFuZ2UsIGxhYmVsRm9ybWF0LCBoaXN0b2dyYW0pIHtcclxuICAgIFxyXG4gICAgICAgIHZhciBsZWdlbmQgPSB0aGlzLl9lbGVtZW50cy5wYXJlbnQuZmluZCgnLicgKyBvcHRpb25zLmxlZ2VuZENsYXNzTmFtZSk7XHJcbiAgICAgICAgaWYgKGxlZ2VuZC5sZW5ndGggPT0gMCkge1xyXG4gICAgICAgICAgICBsZWdlbmQgPSAkKCc8ZGl2IGNsYXNzPVwiJyArIG9wdGlvbnMubGVnZW5kQ2xhc3NOYW1lICsgJ1wiPjwvZGl2PicpO1xyXG4gICAgICAgICAgICB0aGlzLl9lbGVtZW50cy5wYXJlbnQucHJlcGVuZChsZWdlbmQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBsZWdlbmQgPSBkMy5zZWxlY3QobGVnZW5kWzBdKTtcclxuICAgICAgICBcclxuICAgICAgICBsZWdlbmQuc3R5bGUob3B0aW9ucy5sZWdlbmRTdHlsZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVE9ETzogdmFsdWUgbWF5IGJlIGEgZnVuY3Rpb24sIHNvIHdlIGNhbm5vdCBlYXNpbHkgZ2VuZXJhdGUgYSBsYWJlbCBmb3IgaXRcclxuICAgICAgICB2YXIgdGl0bGUgPSBsZWdlbmQuc2VsZWN0QWxsKCdoMycpXHJcbiAgICAgICAgICAgIC5kYXRhKFt2YWx1ZU9yQ2FsbChtZXRhZGF0YS5sYWJlbCwgdmFsdWUpIHx8IChkZC5pc1N0cmluZyh2YWx1ZSkgPyB2YWx1ZSA6ICcnKV0pO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICB0aXRsZS5lbnRlcigpXHJcbiAgICAgICAgICAgIC5hcHBlbmQoJ2gzJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGl0bGVcclxuICAgICAgICAgICAgLmh0bWwoZnVuY3Rpb24oZCl7cmV0dXJuIGQ7fSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gd2UgbmVlZCBoaWdoZXN0IHZhbHVlcyBmaXJzdCBmb3IgbnVtZXJpYyBzY2FsZXNcclxuICAgICAgICBpZiAobWV0YWRhdGEuc2NhbGUgIT0gJ29yZGluYWwnKSB7XHJcbiAgICAgICAgICAgIHJhbmdlLnJldmVyc2UoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNlbGxzID0gbGVnZW5kLnNlbGVjdEFsbCgnZGl2LmxlZ2VuZENlbGwnKVxyXG4gICAgICAgICAgICAuZGF0YShyYW5nZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY2VsbHMuZXhpdCgpLnJlbW92ZSgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBuZXdjZWxscyA9IGNlbGxzLmVudGVyKClcclxuICAgICAgICAgICAgLmFwcGVuZCgnZGl2JylcclxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2xlZ2VuZENlbGwnKVxyXG4gICAgICAgICAgICAuc3R5bGUob3B0aW9ucy5jZWxsU3R5bGUpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICBuZXdjZWxscy5hcHBlbmQoJ3NwYW4nKVxyXG4gICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnbGVnZW5kQ29sb3InKVxyXG4gICAgICAgICAgICAuc3R5bGUob3B0aW9ucy5jb2xvckJveFN0eWxlKVxyXG4gICAgICAgICAgICAuYXBwZW5kKCdzcGFuJylcclxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2ZpbGwnKVxyXG4gICAgICAgICAgICAuc3R5bGUob3B0aW9ucy5jb2xvckZpbGxTdHlsZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgbmV3Y2VsbHMuYXBwZW5kKCdzcGFuJylcclxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywnbGVnZW5kTGFiZWwnKVxyXG4gICAgICAgICAgICAuc3R5bGUob3B0aW9ucy50ZXh0U3R5bGUpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChvcHRpb25zLmhpc3RvZ3JhbSkge1xyXG5cclxuICAgICAgICAgICAgbmV3Y2VsbHMuYXBwZW5kKCdzcGFuJylcclxuICAgICAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsICdsZWdlbmRIaXN0b2dyYW1CYXInKVxyXG4gICAgICAgICAgICAgICAgLnN0eWxlKG9wdGlvbnMuaGlzdG9ncmFtQmFyU3R5bGUpO1xyXG5cclxuICAgICAgICAgICAgY2VsbHMuc2VsZWN0KCcubGVnZW5kSGlzdG9ncmFtQmFyJykudHJhbnNpdGlvbigpXHJcbiAgICAgICAgICAgICAgICAuc3R5bGUoJ3dpZHRoJywgZnVuY3Rpb24oZCxpKXtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgd2lkdGggPSAoaGlzdG9ncmFtW2hpc3RvZ3JhbS5sZW5ndGgtaS0xXS55ICogb3B0aW9ucy5oaXN0b2dyYW1MZW5ndGgpO1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIGFsd2F5cyByb3VuZCB1cCB0byBtYWtlIHN1cmUgYXQgbGVhc3QgMXB4IHdpZGVcclxuICAgICAgICAgICAgICAgICAgICBpZiAod2lkdGggPiAwICYmIHdpZHRoIDwgMSkgd2lkdGggPSAxO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBNYXRoLnJvdW5kKHdpZHRoKSArICdweCc7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNlbGxzLnNlbGVjdCgnLmxlZ2VuZENvbG9yIC5maWxsJylcclxuICAgICAgICAgICAgLnRyYW5zaXRpb24oKVxyXG4gICAgICAgICAgICAuc3R5bGUoe1xyXG4gICAgICAgICAgICAgICAgJ2JhY2tncm91bmQtY29sb3InOiBmdW5jdGlvbihkKSB7cmV0dXJuIGQ7fSxcclxuICAgICAgICAgICAgICAgICdib3JkZXItY29sb3InOiBmdW5jdGlvbihkKSB7cmV0dXJuIGQ7fSxcclxuICAgICAgICAgICAgICAgICdjb2xvcic6IGZ1bmN0aW9uKGQpIHtyZXR1cm4gZDt9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNlbGxzLnNlbGVjdCgnLmxlZ2VuZExhYmVsJylcclxuICAgICAgICAgICAgLnRleHQobGFiZWxGb3JtYXQpO1xyXG4gICAgfVxyXG59XHJcblxyXG5tYXBtYXAubGVnZW5kLnN2ZyA9IGZ1bmN0aW9uKHJhbmdlLCBsYWJlbEZvcm1hdCwgaGlzdG9ncmFtLCBvcHRpb25zKSB7XHJcblxyXG4gICAgdmFyIERFRkFVTFRTID0ge1xyXG4gICAgICAgIGNlbGxTcGFjaW5nOiA1LFxyXG4gICAgICAgIGxheW91dDogJ3ZlcnRpY2FsJyxcclxuICAgICAgICBoaXN0b2dyYW06IGZhbHNlLFxyXG4gICAgICAgIGhpc3RvZ3JhbUxlbmd0aDogODAsXHJcbiAgICAgICAgY29udGFpbmVyQXR0cmlidXRlczoge1xyXG4gICAgICAgICAgICB0cmFuc2Zvcm06ICd0cmFuc2xhdGUoMjAsMTApJ1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgYmFja2dyb3VuZEF0dHJpYnV0ZXM6IHtcclxuICAgICAgICAgICAgZmlsbDogJyNmZmYnLFxyXG4gICAgICAgICAgICAnZmlsbC1vcGFjaXR5JzogMC45LFxyXG4gICAgICAgICAgICB4OiAtMTAsXHJcbiAgICAgICAgICAgIHk6IC0xMCxcclxuICAgICAgICAgICAgd2lkdGg6IDIyMFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgY2VsbEF0dHJpYnV0ZXM6IHtcclxuICAgICAgICB9LFxyXG4gICAgICAgIGNvbG9yQXR0cmlidXRlczoge1xyXG4gICAgICAgICAgICAnd2lkdGgnOiA0MCxcclxuICAgICAgICAgICAgJ2hlaWdodCc6IDE4LFxyXG4gICAgICAgICAgICAnc3Ryb2tlJzogJyMwMDAnLFxyXG4gICAgICAgICAgICAnc3Ryb2tlLXdpZHRoJzogJzAuNXB4JyxcclxuICAgICAgICAgICAgJ2ZpbGwnOiAnI2ZmZicgIC8vIHRoaXMgd2lsbCBiZSB1c2VkIGJlZm9yZSBmaXJzdCB0cmFuc2l0aW9uXHJcbiAgICAgICAgfSxcclxuICAgICAgICB0ZXh0QXR0cmlidXRlczoge1xyXG4gICAgICAgICAgICAnZm9udC1zaXplJzogMTAsXHJcbiAgICAgICAgICAgICdwb2ludGVyLWV2ZW50cyc6ICdub25lJyxcclxuICAgICAgICAgICAgZHk6IDEyXHJcbiAgICAgICAgfSxcclxuICAgICAgICBoaXN0b2dyYW1CYXJBdHRyaWJ1dGVzOiB7XHJcbiAgICAgICAgICAgIHdpZHRoOiAwLFxyXG4gICAgICAgICAgICB4OiAxNDAsXHJcbiAgICAgICAgICAgIHk6IDQsXHJcbiAgICAgICAgICAgIGhlaWdodDogMTAsXHJcbiAgICAgICAgICAgIGZpbGw6ICcjMDAwJyxcclxuICAgICAgICAgICAgJ2ZpbGwtb3BhY2l0eSc6IDAuMlxyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgLy8gVE9ETzogd2UgY2FuJ3QgaW50ZWdyYXRlIHRoZXMgaW50byBzZXR0aW5ncyBiZWNhdXNlIGl0IHJlZmVyZW5jZXMgc2V0dGluZ3MgYXR0cmlidXRlc1xyXG4gICAgdmFyIGxheW91dHMgPSB7XHJcbiAgICAgICAgJ2hvcml6b250YWwnOiB7XHJcbiAgICAgICAgICAgIGNlbGxBdHRyaWJ1dGVzOiB7XHJcbiAgICAgICAgICAgICAgICB0cmFuc2Zvcm06IGZ1bmN0aW9uKGQsaSl7IHJldHVybiAndHJhbnNsYXRlKCcgKyBpICogKG9wdGlvbnMuY29sb3JBdHRyaWJ1dGVzLndpZHRoICsgb3B0aW9ucy5jZWxsU3BhY2luZykgKyAnLDApJzt9XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIHRleHRBdHRyaWJ1dGVzOiB7XHJcbiAgICAgICAgICAgICAgICB5OiBmdW5jdGlvbigpIHsgcmV0dXJuIG9wdGlvbnMuY29sb3JBdHRyaWJ1dGVzLmhlaWdodCArIG9wdGlvbnMuY2VsbFNwYWNpbmc7fVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9LFxyXG4gICAgICAgICd2ZXJ0aWNhbCc6IHtcclxuICAgICAgICAgICAgY2VsbEF0dHJpYnV0ZXM6IHtcclxuICAgICAgICAgICAgICAgIHRyYW5zZm9ybTogZnVuY3Rpb24oZCxpKXsgcmV0dXJuICd0cmFuc2xhdGUoMCwnICsgaSAqIChvcHRpb25zLmNvbG9yQXR0cmlidXRlcy5oZWlnaHQgKyBvcHRpb25zLmNlbGxTcGFjaW5nKSArICcpJzt9XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIHRleHRBdHRyaWJ1dGVzOiB7XHJcbiAgICAgICAgICAgICAgICB4OiBmdW5jdGlvbigpIHsgcmV0dXJuIG9wdGlvbnMuY29sb3JBdHRyaWJ1dGVzLndpZHRoICsgb3B0aW9ucy5jZWxsU3BhY2luZzt9LFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICB2YXIgbGF5b3V0ID0gbGF5b3V0c1tvcHRpb25zLmxheW91dF07XHJcbiAgICBcclxuICAgIGlmIChvcHRpb25zLmxheW91dCA9PSAndmVydGljYWwnKSB7XHJcbiAgICAgICAgcmFuZ2UucmV2ZXJzZSgpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB0aGlzLl9lbGVtZW50cy5sZWdlbmQuYXR0cihvcHRpb25zLmNvbnRhaW5lckF0dHJpYnV0ZXMpO1xyXG4gXHJcbiAgICB2YXIgYmcgPSB0aGlzLl9lbGVtZW50cy5sZWdlbmQuc2VsZWN0QWxsKCdyZWN0LmJhY2tncm91bmQnKVxyXG4gICAgICAgIC5kYXRhKFsxXSk7XHJcbiAgICBcclxuICAgIGJnLmVudGVyKClcclxuICAgICAgICAuYXBwZW5kKCdyZWN0JylcclxuICAgICAgICAuYXR0cignY2xhc3MnLCAnYmFja2dyb3VuZCcpXHJcbiAgICAgICAgLmF0dHIob3B0aW9ucy5iYWNrZ3JvdW5kQXR0cmlidXRlcyk7XHJcbiAgICBiZy50cmFuc2l0aW9uKCkuYXR0cignaGVpZ2h0JywgaGlzdG9ncmFtLmxlbmd0aCAqIChvcHRpb25zLmNvbG9yQXR0cmlidXRlcy5oZWlnaHQgKyBvcHRpb25zLmNlbGxTcGFjaW5nKSArICgyMCAtIG9wdGlvbnMuY2VsbFNwYWNpbmcpKTsgICAgXHJcbiAgICAgICAgXHJcbiAgICB2YXIgY2VsbHMgPSB0aGlzLl9lbGVtZW50cy5sZWdlbmQuc2VsZWN0QWxsKCdnLmNlbGwnKVxyXG4gICAgICAgIC5kYXRhKHJhbmdlKTtcclxuICAgIFxyXG4gICAgY2VsbHMuZXhpdCgpLnJlbW92ZSgpO1xyXG4gICAgXHJcbiAgICB2YXIgbmV3Y2VsbHMgPSBjZWxscy5lbnRlcigpXHJcbiAgICAgICAgLmFwcGVuZCgnZycpXHJcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2NlbGwnKVxyXG4gICAgICAgIC5hdHRyKG9wdGlvbnMuY2VsbEF0dHJpYnV0ZXMpXHJcbiAgICAgICAgLmF0dHIobGF5b3V0LmNlbGxBdHRyaWJ1dGVzKTtcclxuICAgICAgICBcclxuICAgIG5ld2NlbGxzLmFwcGVuZCgncmVjdCcpXHJcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2NvbG9yJylcclxuICAgICAgICAuYXR0cihvcHRpb25zLmNvbG9yQXR0cmlidXRlcylcclxuICAgICAgICAuYXR0cihsYXlvdXQuY29sb3JBdHRyaWJ1dGVzKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgaWYgKG9wdGlvbnMuaGlzdG9ncmFtKSB7XHJcblxyXG4gICAgICAgIG5ld2NlbGxzLmFwcGVuZCgncmVjdCcpXHJcbiAgICAgICAgICAgIC5hdHRyKFwiY2xhc3NcIiwgXCJiYXJcIilcclxuICAgICAgICAgICAgLmF0dHIob3B0aW9ucy5oaXN0b2dyYW1CYXJBdHRyaWJ1dGVzKTtcclxuXHJcbiAgICAgICAgY2VsbHMuc2VsZWN0KCcuYmFyJykudHJhbnNpdGlvbigpXHJcbiAgICAgICAgICAgIC5hdHRyKFwid2lkdGhcIiwgZnVuY3Rpb24oZCxpKXtcclxuICAgICAgICAgICAgICAgIHJldHVybiBoaXN0b2dyYW1baGlzdG9ncmFtLmxlbmd0aC1pLTFdLnkgKiBvcHRpb25zLmhpc3RvZ3JhbUxlbmd0aDtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgbmV3Y2VsbHMuYXBwZW5kKCd0ZXh0JylcclxuICAgICAgICAuYXR0cihvcHRpb25zLnRleHRBdHRyaWJ1dGVzKVxyXG4gICAgICAgIC5hdHRyKGxheW91dC50ZXh0QXR0cmlidXRlcyk7XHJcbiAgICBcclxuICAgIGNlbGxzLnNlbGVjdCgnLmNvbG9yJykudHJhbnNpdGlvbigpXHJcbiAgICAgICAgLmF0dHIoJ2ZpbGwnLCBmdW5jdGlvbihkKSB7cmV0dXJuIGQ7fSk7XHJcbiAgICBcclxuICAgIGNlbGxzLnNlbGVjdCgndGV4dCcpXHJcbiAgICAgICAgLnRleHQobGFiZWxGb3JtYXQpO1xyXG59XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLnByb2plY3Rpb24gPSBmdW5jdGlvbihwcm9qZWN0aW9uKSB7XHJcbiAgICB0aGlzLl9wcm9qZWN0aW9uID0gcHJvamVjdGlvbjtcclxuICAgIHJldHVybiB0aGlzO1xyXG59XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLmV4dGVudCA9IGZ1bmN0aW9uKHNlbGVjdGlvbiwgb3B0aW9ucykge1xyXG5cclxuICAgIHZhciBtYXAgPSB0aGlzO1xyXG4gICAgXHJcbiAgICB0aGlzLnNlbGVjdGVkX2V4dGVudCA9IHNlbGVjdGlvbiB8fCB0aGlzLnNlbGVjdGVkO1xyXG4gICAgXHJcbiAgICB0aGlzLl9wcm9taXNlLmdlb21ldHJ5LnRoZW4oZnVuY3Rpb24odG9wbykge1xyXG4gICAgICAgIC8vIFRPRE86IGdldFJlcHJlc2VudGF0aW9ucygpIGRlcGVuZHMgb24gPHBhdGg+cyBiZWluZyBkcmF3biwgYnV0IHdlIHdhbnQgdG8gXHJcbiAgICAgICAgLy8gYmUgYWJsZSB0byBjYWxsIGV4dGVudCgpIGJlZm9yZSBkcmF3KCkgdG8gc2V0IHVwIHByb2plY3Rpb25cclxuICAgICAgICAvLyBzb2x1dGlvbjogbWFuYWdlIG1lcmdlZCBnZW9tZXRyeSArIGRhdGEgaW5kZXBlbmRlbnQgZnJvbSBTVkcgcmVwcmVzZW50YXRpb25cclxuICAgICAgICB2YXIgZ2VvbSA9IG1hcC5nZXRSZXByZXNlbnRhdGlvbnMobWFwLnNlbGVjdGVkX2V4dGVudCk7XHJcbiAgICAgICAgdmFyIGFsbCA9IHtcclxuICAgICAgICAgICAgJ3R5cGUnOiAnRmVhdHVyZUNvbGxlY3Rpb24nLFxyXG4gICAgICAgICAgICAnZmVhdHVyZXMnOiBbXVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgZ2VvbS5lYWNoKGZ1bmN0aW9uKGQpe1xyXG4gICAgICAgICAgICBhbGwuZmVhdHVyZXMucHVzaChkKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgbWFwLl9leHRlbnQoYWxsLCBvcHRpb25zKTtcclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLl9leHRlbnQgPSBmdW5jdGlvbihnZW9tLCBvcHRpb25zKSB7XHJcblxyXG4gICAgb3B0aW9ucyA9IGRkLm1lcmdlKHtcclxuICAgICAgICBmaWxsRmFjdG9yOiAwLjlcclxuICAgIH0sIG9wdGlvbnMpO1xyXG4gICAgXHJcbiAgICAvLyBjb252ZXJ0L21lcmdlIHRvcG9KU09OXHJcbiAgICBpZiAoZ2VvbS50eXBlICYmIGdlb20udHlwZSA9PSAnVG9wb2xvZ3knKSB7XHJcbiAgICAgICAgLy8gd2UgbmVlZCB0byBtZXJnZSBhbGwgbmFtZWQgZmVhdHVyZXNcclxuICAgICAgICB2YXIgbmFtZXMgPSBPYmplY3Qua2V5cyhnZW9tLm9iamVjdHMpO1xyXG4gICAgICAgIHZhciBhbGwgPSBbXTtcclxuICAgICAgICBmb3IgKHZhciBpPTA7IGk8bmFtZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgJC5tZXJnZShhbGwsIHRvcG9qc29uLmZlYXR1cmUoZ2VvbSwgZ2VvbS5vYmplY3RzW25hbWVzW2ldXSkuZmVhdHVyZXMpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBnZW9tID0gYWxsO1xyXG4gICAgfVxyXG4gICAgaWYgKGRkLmlzQXJyYXkoZ2VvbSkpIHtcclxuICAgICAgICB2YXIgYWxsID0ge1xyXG4gICAgICAgICAgICAndHlwZSc6ICdGZWF0dXJlQ29sbGVjdGlvbicsXHJcbiAgICAgICAgICAgICdmZWF0dXJlcyc6IGdlb21cclxuICAgICAgICB9O1xyXG4gICAgICAgIGdlb20gPSBhbGw7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIHJlc2V0IHNjYWxlIHRvIGJlIGFibGUgdG8gY2FsY3VsYXRlIGV4dGVudHMgb2YgZ2VvbWV0cnlcclxuICAgIHRoaXMuX3Byb2plY3Rpb24uc2NhbGUoMSkudHJhbnNsYXRlKFswLCAwXSk7XHJcbiAgICB2YXIgcGF0aEdlbmVyYXRvciA9IGQzLmdlby5wYXRoKCkucHJvamVjdGlvbih0aGlzLl9wcm9qZWN0aW9uKTtcclxuICAgIHZhciBib3VuZHMgPSBwYXRoR2VuZXJhdG9yLmJvdW5kcyhnZW9tKTtcclxuICAgIC8vIHVzZSBhYnNvbHV0ZSB2YWx1ZXMsIGFzIGVhc3QgZG9lcyBub3QgYWx3YXlzIGhhdmUgdG8gYmUgcmlnaHQgb2Ygd2VzdCFcclxuICAgIGJvdW5kcy5oZWlnaHQgPSBNYXRoLmFicyhib3VuZHNbMV1bMV0gLSBib3VuZHNbMF1bMV0pO1xyXG4gICAgYm91bmRzLndpZHRoID0gTWF0aC5hYnMoYm91bmRzWzFdWzBdIC0gYm91bmRzWzBdWzBdKTtcclxuICAgIFxyXG4gICAgLy8gaWYgd2UgYXJlIG5vdCBjZW50ZXJlZCBpbiBtaWRwb2ludCwgY2FsY3VsYXRlIFwicGFkZGluZyBmYWN0b3JcIlxyXG4gICAgdmFyIGZhY194ID0gMSAtIE1hdGguYWJzKDAuNSAtIGNlbnRlci54KSAqIDIsXHJcbiAgICAgICAgZmFjX3kgPSAxIC0gTWF0aC5hYnMoMC41IC0gY2VudGVyLnkpICogMjtcclxuICAgICAgICBcclxuICAgIHZhciBzaXplID0gdGhpcy5zaXplKCk7XHJcbiAgICB2YXIgc2NhbGUgPSBvcHRpb25zLmZpbGxGYWN0b3IgLyBNYXRoLm1heChib3VuZHMud2lkdGggLyBzaXplLndpZHRoIC8gZmFjX3gsIGJvdW5kcy5oZWlnaHQgLyBzaXplLmhlaWdodCAvIGZhY195KTtcclxuICAgIFxyXG4gICAgdGhpcy5fcHJvamVjdGlvblxyXG4gICAgICAgIC5zY2FsZShzY2FsZSlcclxuICAgICAgICAudHJhbnNsYXRlKFsoc2l6ZS53aWR0aCAtIHNjYWxlICogKGJvdW5kc1sxXVswXSArIGJvdW5kc1swXVswXSkpLyAyLCAoc2l6ZS5oZWlnaHQgLSBzY2FsZSAqIChib3VuZHNbMV1bMV0gKyBib3VuZHNbMF1bMV0pKS8gMl0pOyAgXHJcbiAgICBcclxuICAgIC8vIGFwcGx5IG5ldyBwcm9qZWN0aW9uIHRvIGV4aXN0aW5nIHBhdGhzXHJcbiAgICB0aGlzLl9lbGVtZW50cy5tYXAuc2VsZWN0QWxsKFwicGF0aFwiKVxyXG4gICAgICAgIC5hdHRyKFwiZFwiLCBwYXRoR2VuZXJhdG9yKTsgICAgICAgIFxyXG4gICAgXHJcbn07XHJcblxyXG5mdW5jdGlvbiBrZXlPckNhbGxiYWNrKHZhbCkge1xyXG4gICAgaWYgKHR5cGVvZiB2YWwgIT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIHJldHVybiBmdW5jdGlvbihkKXtcclxuICAgICAgICAgICAgcmV0dXJuIGRbdmFsXTtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHZhbDtcclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBtYXBtYXA7IiwiLyohIGRhdGFkYXRhLmpzIMKpIDIwMTQtMjAxNSBGbG9yaWFuIExlZGVybWFubiBcclxuXHJcblRoaXMgcHJvZ3JhbSBpcyBmcmVlIHNvZnR3YXJlOiB5b3UgY2FuIHJlZGlzdHJpYnV0ZSBpdCBhbmQvb3IgbW9kaWZ5XHJcbml0IHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgR05VIEFmZmVybyBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFzIHB1Ymxpc2hlZCBieVxyXG50aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uLCBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxyXG4oYXQgeW91ciBvcHRpb24pIGFueSBsYXRlciB2ZXJzaW9uLlxyXG5cclxuVGhpcyBwcm9ncmFtIGlzIGRpc3RyaWJ1dGVkIGluIHRoZSBob3BlIHRoYXQgaXQgd2lsbCBiZSB1c2VmdWwsXHJcbmJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXHJcbk1FUkNIQU5UQUJJTElUWSBvciBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRS4gIFNlZSB0aGVcclxuR05VIEFmZmVybyBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGZvciBtb3JlIGRldGFpbHMuXHJcblxyXG5Zb3Ugc2hvdWxkIGhhdmUgcmVjZWl2ZWQgYSBjb3B5IG9mIHRoZSBHTlUgQWZmZXJvIEdlbmVyYWwgUHVibGljIExpY2Vuc2VcclxuYWxvbmcgd2l0aCB0aGlzIHByb2dyYW0uICBJZiBub3QsIHNlZSA8aHR0cDovL3d3dy5nbnUub3JnL2xpY2Vuc2VzLz4uXHJcbiovXHJcblxyXG4ndXNlIHN0cmljdCc7XHJcblxyXG4vLyB0ZXN0IHdoZXRoZXIgaW4gYSBicm93c2VyIGVudmlyb25tZW50XHJcbmlmICh0eXBlb2Ygd2luZG93ID09PSAndW5kZWZpbmVkJykge1xyXG4gICAgLy8gbm9kZVxyXG4gICAgdmFyIGQzZHN2ID0gcmVxdWlyZSgnZDMtZHN2Jyk7XHJcbiAgICB2YXIgZnMgPSByZXF1aXJlKCdmcycpO1xyXG4gICAgXHJcbiAgICB2YXIgZmlsZXBhcnNlciA9IGZ1bmN0aW9uKGZ1bmMpIHtcclxuICAgICAgICByZXR1cm4gZnVuY3Rpb24ocGF0aCwgcm93LCBjYWxsYmFjaykge1xyXG4gICAgICAgICAgICBpZiAoZGQuaXNVbmRlZmluZWQoY2FsbGJhY2spKSB7XHJcbiAgICAgICAgICAgICAgICBjYWxsYmFjayA9IHJvdztcclxuICAgICAgICAgICAgICAgIHJvdyA9IG51bGw7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZnMucmVhZEZpbGUocGF0aCwgJ3V0ZjgnLCBmdW5jdGlvbihlcnJvciwgZGF0YSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY2FsbGJhY2soZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgZGF0YSA9IGZ1bmMoZGF0YSwgcm93KTtcclxuICAgICAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsZGF0YSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH07XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB2YXIgZDMgPSB7XHJcbiAgICAgICAgY3N2OiBmaWxlcGFyc2VyKGQzZHN2LmNzdi5wYXJzZSksXHJcbiAgICAgICAgdHN2OiBmaWxlcGFyc2VyKGQzZHN2LnRzdi5wYXJzZSksXHJcbiAgICAgICAganNvbjogZmlsZXBhcnNlcihKU09OLnBhcnNlKVxyXG4gICAgfTtcclxuXHJcbn0gZWxzZSB7XHJcbiAgICAvLyBicm93c2VyXHJcbiAgICAvLyB3ZSBleHBlY3QgZ2xvYmFsIGQzIHRvIGJlIGF2YWlsYWJsZVxyXG4gICAgdmFyIGQzID0gd2luZG93LmQzO1xyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gcm93RmlsZUhhbmRsZXIobG9hZGVyKSB7XHJcbiAgICAvLyBUT0RPOiBmaWxlIGhhbmRsZXIgQVBJIHNob3VsZCBub3QgbmVlZCB0byBiZSBwYXNzZWQgbWFwLCByZWR1Y2UgZnVuY3Rpb25zIGJ1dCBiZSB3cmFwcGVkIGV4dGVybmFsbHlcclxuICAgIHJldHVybiBmdW5jdGlvbihwYXRoLCBtYXAsIHJlZHVjZSwgb3B0aW9ucykge1xyXG4gICAgXHJcbiAgICAgICAgb3B0aW9ucyA9IGRkLm1lcmdlKHtcclxuICAgICAgICAgICAgLy8gZGVmYXVsdCBhY2Nlc3NvciBmdW5jdGlvbiB0cmllcyB0byBjb252ZXJ0IG51bWJlci1saWtlIHN0cmluZ3MgdG8gbnVtYmVyc1xyXG4gICAgICAgICAgICBhY2Nlc3NvcjogZnVuY3Rpb24oZCkge1xyXG4gICAgICAgICAgICAgICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhkKTtcclxuICAgICAgICAgICAgICAgIGZvciAodmFyIGk9MDsgaTxrZXlzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIGtleSA9IGtleXNbaV07XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gY29udmVydCB0byBudW1iZXIgaWYgaXQgbG9va3MgbGlrZSBhIG51bWJlclxyXG4gICAgICAgICAgICAgICAgICAgIGlmICghaXNOYU4oK2Rba2V5XSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZFtrZXldID0gK2Rba2V5XTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0sIG9wdGlvbnMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcclxuICAgICAgICAgICAgbG9hZGVyKHBhdGgsIG9wdGlvbnMuYWNjZXNzb3IsXHJcbiAgICAgICAgICAgICAgICBmdW5jdGlvbihlcnJvciwgZGF0YSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZGQubWFwcmVkdWNlKGRhdGEsIG1hcCwgcmVkdWNlKSk7ICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9KTsgXHJcbiAgICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBqc29uRmlsZUhhbmRsZXIocGF0aCwgbWFwLCByZWR1Y2UpIHtcclxuICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcclxuICAgICAgICBkMy5qc29uKHBhdGgsIGZ1bmN0aW9uKGVycm9yLCBkYXRhKSB7XHJcbiAgICAgICAgICAgIGlmIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoZGQuaXNBcnJheShkYXRhKSkge1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShkZC5tYXByZWR1Y2UoZGF0YSwgbWFwLCByZWR1Y2UpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIC8vIG9iamVjdCAtIHRyZWF0IGVudHJpZXMgYXMga2V5cyBieSBkZWZhdWx0XHJcbiAgICAgICAgICAgICAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGRhdGEpO1xyXG4gICAgICAgICAgICAgICAgdmFyIG1hcF9mdW5jO1xyXG4gICAgICAgICAgICAgICAgaWYgKCFtYXApIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyB1c2Uga2V5cyBhcyBkYXRhIHRvIGVtaXQga2V5L2RhdGEgcGFpcnMgaW4gbWFwIHN0ZXAhXHJcbiAgICAgICAgICAgICAgICAgICAgbWFwX2Z1bmMgPSBkZC5tYXAuZGljdChkYXRhKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIG1hcF9mdW5jID0gZnVuY3Rpb24oaywgZW1pdCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBwdXQgb3JpZ2luYWwga2V5IGludG8gb2JqZWN0XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciB2ID0gZGF0YVtrXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdi5fX2tleV9fID0gaztcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gY2FsbCB1c2VyLXByb3ZpZGVkIG1hcCBmdW50aW9uIHdpdGggb2JqZWN0XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hcCh2LCBlbWl0KTtcclxuICAgICAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShkZC5tYXByZWR1Y2Uoa2V5cywgbWFwX2Z1bmMsIHJlZHVjZSkpO1xyXG4gICAgICAgICAgICB9ICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICB9KTtcclxuICAgIH0pO1xyXG59XHJcblxyXG52YXIgZmlsZUhhbmRsZXJzID0ge1xyXG4gICAgJ2Nzdic6ICByb3dGaWxlSGFuZGxlcihkMy5jc3YpLFxyXG4gICAgJ3Rzdic6ICByb3dGaWxlSGFuZGxlcihkMy50c3YpLFxyXG4gICAgJ2pzb24nOiBqc29uRmlsZUhhbmRsZXJcclxufTtcclxuXHJcbnZhciBnZXRGaWxlSGFuZGxlciA9IGZ1bmN0aW9uKHBhdGhPckV4dCkge1xyXG4gICAgLy8gZ3Vlc3MgdHlwZVxyXG4gICAgdmFyIGV4dCA9IHBhdGhPckV4dC5zcGxpdCgnLicpLnBvcCgpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICByZXR1cm4gZmlsZUhhbmRsZXJzW2V4dF0gfHwgbnVsbDtcclxufTtcclxuXHJcbnZhciByZWdpc3RlckZpbGVIYW5kbGVyID0gZnVuY3Rpb24oZXh0LCBoYW5kbGVyKSB7XHJcbiAgICBmaWxlSGFuZGxlcnNbZXh0XSA9IGhhbmRsZXI7XHJcbn07XHJcblxyXG4vLyBUT0RPOiByZWdpc3RlciAudG9wb2pzb24sIC5nZW9qc29uIGluIG1hcG1hcC5qc1xyXG5cclxuLyoqXHJcbkRhdGFkYXRhIC0gYSBtb2R1bGUgZm9yIGxvYWRpbmcgYW5kIHByb2Nlc3NpbmcgZGF0YS5cclxuWW91IGNhbiBjYWxsIHRoZSBtb2R1bGUgYXMgYSBmdW5jdGlvbiB0byBjcmVhdGUgYSBwcm9taXNlIGZvciBkYXRhIGZyb20gYSBVUkwsIEZ1bmN0aW9uIG9yIEFycmF5LiBcclxuUmV0dXJucyBhIHByb21pc2UgZm9yIGRhdGEgZm9yIGV2ZXJ5dGhpbmcuXHJcbkBwYXJhbSB7KHN0cmluZ3xmdW5jdGlvbnxBcnJheSl9IHNwZWMgLSBBIFN0cmluZyAoVVJMKSwgRnVuY3Rpb24gb3IgQXJyYXkgb2YgZGF0YS5cclxuQHBhcmFtIHsoZnVuY3Rpb258c3RyaW5nKX0gW21hcD17QGxpbmsgZGF0YWRhdGEubWFwLmRpY3R9XSAgLSBUaGUgbWFwIGZ1bmN0aW9uIGZvciBtYXAvcmVkdWNlLlxyXG5AcGFyYW0geyhzdHJpbmcpfSBbcmVkdWNlPWRhdGFkYXRhLmVtaXQubGFzdF0gLSBUaGUgcmVkdWNlIGZ1bmN0aW9uIGZvciBtYXAvcmVkdWNlLlxyXG5AZXhwb3J0cyBtb2R1bGU6ZGF0YWRhdGFcclxuKi9cclxudmFyIGRkID0gZnVuY3Rpb24oc3BlYywgbWFwLCByZWR1Y2UsIG9wdGlvbnMpIHtcclxuXHJcbiAgICAvLyBvcHRpb25zXHJcbiAgICAvLyB0eXBlOiBvdmVycmlkZSBmaWxlIGV4dGVuc2lvbiwgZS5nLiBmb3IgQVBJIHVybHMgKGUuZy4gJ2NzdicpXHJcbiAgICAvLyBmaWxlSGFuZGxlcjogbWFudWFsbHkgc3BlY2lmeSBmaWxlIGhhbmRsZXIgdG8gYmUgdXNlZCB0byBsb2FkICYgcGFyc2UgZmlsZVxyXG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XHJcblxyXG4gICAgaWYgKHNwZWMgPT0gbnVsbCkgdGhyb3cgbmV3IEVycm9yKFwiZGF0YWRhdGEuanM6IE5vIGRhdGEgc3BlY2lmaWNhdGlvbi5cIik7XHJcbiAgICAgICAgXHJcbiAgICBpZiAobWFwICYmICFkZC5pc0Z1bmN0aW9uKG1hcCkpIHtcclxuICAgICAgICAvLyBtYXAgaXMgc3RyaW5nIC0+IG1hcCB0byBhdHRyaWJ1dGUgdmFsdWVcclxuICAgICAgICBtYXAgPSBkZC5tYXAua2V5KG1hcCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmIChkZC5pc1N0cmluZyhzcGVjKSkge1xyXG4gICAgICAgIC8vIGNvbnNpZGVyIHNwZWMgdG8gYmUgYSBVUkwvZmlsZSB0byBsb2FkXHJcbiAgICAgICAgdmFyIGhhbmRsZXIgPSBvcHRpb25zLmZpbGVIYW5kbGVyIHx8IGdldEZpbGVIYW5kbGVyKG9wdGlvbnMudHlwZSB8fCBzcGVjKTtcclxuICAgICAgICBpZiAoaGFuZGxlcikge1xyXG4gICAgICAgICAgICByZXR1cm4gaGFuZGxlcihzcGVjLCBtYXAsIHJlZHVjZSwgb3B0aW9ucyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJkYXRhZGF0YS5qczogVW5rbm93biBmaWxlIHR5cGUgZm9yOiBcIiArIHNwZWMpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGlmIChkZC5pc0FycmF5KHNwZWMpKSB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xyXG4gICAgICAgICAgICByZXNvbHZlKGRkLm1hcHJlZHVjZShzcGVjLCBtYXAsIHJlZHVjZSkpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiZGF0YWRhdGEuanM6IFVua25vd24gZGF0YSBzcGVjaWZpY2F0aW9uLlwiKTtcclxufTtcclxuXHJcbi8vIGV4cG9zZSByZWdpc3RyYXRpb24gbWV0aG9kICYgcm93RmlsZUhhbmRsZXIgaGVscGVyXHJcbmRkLnJlZ2lzdGVyRmlsZUhhbmRsZXIgPSByZWdpc3RlckZpbGVIYW5kbGVyO1xyXG5kZC5yb3dGaWxlSGFuZGxlciA9IHJvd0ZpbGVIYW5kbGVyO1xyXG5cclxuLy8gc2ltcGxlIGxvYWQgZnVuY3Rpb24sIHJldHVybnMgYSBwcm9taXNlIGZvciBkYXRhIHdpdGhvdXQgbWFwL3JlZHVjZS1pbmdcclxuLy8gRE8gTk9UIFVTRSAtIHByZXNlbnQgb25seSBmb3IgbGVnYWN5IHJlYXNvbnNcclxuZGQubG9hZCA9IGZ1bmN0aW9uKHNwZWMsIGtleSkge1xyXG4gICAgaWYgKHNwZWMudGhlbiAmJiB0eXBlb2Ygc3BlYy50aGVuID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgLy8gYWxyZWFkeSBhIHRoZW5hYmxlIC8gcHJvbWlzZVxyXG4gICAgICAgIHJldHVybiBzcGVjO1xyXG4gICAgfVxyXG4gICAgZWxzZSBpZiAoZGQuaXNTdHJpbmcoc3BlYykpIHtcclxuICAgICAgICAvLyBjb25zaWRlciBzcGVjIHRvIGJlIGEgVVJMIHRvIGxvYWRcclxuICAgICAgICAvLyBndWVzcyB0eXBlXHJcbiAgICAgICAgdmFyIGV4dCA9IHNwZWMuc3BsaXQoJy4nKS5wb3AoKTtcclxuICAgICAgICBpZiAoZXh0ID09ICdqc29uJyB8fCBleHQgPT0gJ3RvcG9qc29uJyB8fCBleHQgPT0gJ2dlb2pzb24nKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcclxuICAgICAgICAgICAgICAgIGQzLmpzb24oc3BlYywgZnVuY3Rpb24oZXJyb3IsIGRhdGEpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGRhdGEpO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xyXG4gICAgICAgICAgICAgICAgZDMuY3N2KHNwZWMsIGZ1bmN0aW9uKHJvdykge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMocm93KTtcclxuICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpPTA7IGk8a2V5cy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIga2V5ID0ga2V5c1tpXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFpc05hTigrcm93W2tleV0pKSB7IC8vIGluIEphdmFTY3JpcHQsIE5hTiAhPT0gTmFOICEhIVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gY29udmVydCB0byBudW1iZXIgaWYgbnVtYmVyXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByb3dba2V5XSA9ICtyb3dba2V5XTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcm93O1xyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uKGVycm9yLCBkYXRhKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShkYXRhKTsgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufTtcclxuXHJcblxyXG4vLyBUeXBlIGNoZWNraW5nXHJcbi8qKlxyXG5SZXR1cm4gdHJ1ZSBpZiBhcmd1bWVudCBpcyBhIHN0cmluZy5cclxuQHBhcmFtIHthbnl9IHZhbCAtIFRoZSB2YWx1ZSB0byBjaGVjay5cclxuKi9cclxuZGQuaXNTdHJpbmcgPSBmdW5jdGlvbiAodmFsKSB7XHJcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWwpID09ICdbb2JqZWN0IFN0cmluZ10nO1xyXG59O1xyXG4vKipcclxuUmV0dXJuIHRydWUgaWYgYXJndW1lbnQgaXMgYSBmdW5jdGlvbi5cclxuQHBhcmFtIHthbnl9IHZhbCAtIFRoZSB2YWx1ZSB0byBjaGVjay5cclxuKi9cclxuZGQuaXNGdW5jdGlvbiA9IGZ1bmN0aW9uKG9iaikge1xyXG4gICAgcmV0dXJuICh0eXBlb2Ygb2JqID09PSAnZnVuY3Rpb24nKTtcclxufTtcclxuLyoqXHJcblJldHVybiB0cnVlIGlmIGFyZ3VtZW50IGlzIGFuIEFycmF5LlxyXG5AcGFyYW0ge2FueX0gdmFsIC0gVGhlIHZhbHVlIHRvIGNoZWNrLlxyXG4qL1xyXG5kZC5pc0FycmF5ID0gZnVuY3Rpb24ob2JqKSB7XHJcbiAgICByZXR1cm4gKG9iaiBpbnN0YW5jZW9mIEFycmF5KTtcclxufTtcclxuLyoqXHJcblJldHVybiB0cnVlIGlmIGFyZ3VtZW50IGlzIGFuIE9iamVjdCwgYnV0IG5vdCBhbiBBcnJheSwgU3RyaW5nIG9yIGFueXRoaW5nIGNyZWF0ZWQgd2l0aCBhIGN1c3RvbSBjb25zdHJ1Y3Rvci5cclxuQHBhcmFtIHthbnl9IHZhbCAtIFRoZSB2YWx1ZSB0byBjaGVjay5cclxuKi9cclxuZGQuaXNEaWN0aW9uYXJ5ID0gZnVuY3Rpb24ob2JqKSB7XHJcbiAgICByZXR1cm4gKG9iaiAmJiBvYmouY29uc3RydWN0b3IgJiYgb2JqLmNvbnN0cnVjdG9yID09PSBPYmplY3QpO1xyXG59O1xyXG4vKipcclxuUmV0dXJuIHRydWUgaWYgYXJndW1lbnQgaXMgdW5kZWZpbmVkLlxyXG5AcGFyYW0ge2FueX0gdmFsIC0gVGhlIHZhbHVlIHRvIGNoZWNrLlxyXG4qL1xyXG5kZC5pc1VuZGVmaW5lZCA9IGZ1bmN0aW9uKG9iaikge1xyXG4gICAgcmV0dXJuICh0eXBlb2Ygb2JqID09ICd1bmRlZmluZWQnKTtcclxufTtcclxuXHJcbi8vIFR5cGUgY29udmVyc2lvbiAvIHV0aWxpdGllc1xyXG4vKipcclxuSWYgdGhlIGFyZ3VtZW50IGlzIGFscmVhZHkgYW4gQXJyYXksIHJldHVybiBhIGNvcHkgb2YgdGhlIEFycmF5LlxyXG5FbHNlLCByZXR1cm4gYSBzaW5nbGUtZWxlbWVudCBBcnJheSBjb250YWluaW5nIHRoZSBhcmd1bWVudC5cclxuKi9cclxuZGQudG9BcnJheSA9IGZ1bmN0aW9uKHZhbCkge1xyXG4gICAgaWYgKCF2YWwpIHJldHVybiBbXTtcclxuICAgIC8vIHJldHVybiBhIGNvcHkgaWYgYXJlYWR5IGFycmF5LCBlbHNlIHNpbmdsZS1lbGVtZW50IGFycmF5XHJcbiAgICByZXR1cm4gZGQuaXNBcnJheSh2YWwpID8gdmFsLnNsaWNlKCkgOiBbdmFsXTtcclxufTtcclxuXHJcbi8qKlxyXG5TaGFsbG93IG9iamVjdCBtZXJnaW5nLCBtYWlubHkgZm9yIG9wdGlvbnMuIFJldHVybnMgYSBuZXcgb2JqZWN0LlxyXG4qL1xyXG5kZC5tZXJnZSA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIG9iaiA9IHt9O1xyXG5cclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgdmFyIHNyYyA9IGFyZ3VtZW50c1tpXTtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKHZhciBrZXkgaW4gc3JjKSB7XHJcbiAgICAgICAgICAgIGlmIChzcmMuaGFzT3duUHJvcGVydHkoa2V5KSkge1xyXG4gICAgICAgICAgICAgICAgb2JqW2tleV0gPSBzcmNba2V5XTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gb2JqO1xyXG59O1xyXG5cclxuLyoqXHJcblJldHVybiBhbiB7QGxpbmsgbW9kdWxlOmRhdGFkYXRhLk9yZGVyZWRIYXNofE9yZGVyZWRIYXNofSBvYmplY3QuXHJcbkBleHBvcnRzIG1vZHVsZTpkYXRhZGF0YS5PcmRlcmVkSGFzaFxyXG4qL1xyXG5kZC5PcmRlcmVkSGFzaCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgLy8gb3JkZXJlZCBoYXNoIGltcGxlbWVudGF0aW9uXHJcbiAgICB2YXIga2V5cyA9IFtdO1xyXG4gICAgdmFyIHZhbHMgPSB7fTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICAvKipcclxuICAgICAgICBBZGQgYSBrZXkvdmFsdWUgcGFpciB0byB0aGUgZW5kIG9mIHRoZSBPcmRlcmVkSGFzaC5cclxuICAgICAgICBAcGFyYW0ge1N0cmluZ30gayAtIEtleVxyXG4gICAgICAgIEBwYXJhbSB2IC0gVmFsdWVcclxuICAgICAgICAqL1xyXG4gICAgICAgIHB1c2g6IGZ1bmN0aW9uKGssdikge1xyXG4gICAgICAgICAgICBpZiAoIXZhbHNba10pIGtleXMucHVzaChrKTtcclxuICAgICAgICAgICAgdmFsc1trXSA9IHY7XHJcbiAgICAgICAgfSxcclxuICAgICAgICAvKipcclxuICAgICAgICBJbnNlcnQgYSBrZXkvdmFsdWUgcGFpciBhdCB0aGUgc3BlY2lmaWVkIHBvc2l0aW9uLlxyXG4gICAgICAgIEBwYXJhbSB7TnVtYmVyfSBpIC0gSW5kZXggdG8gaW5zZXJ0IHZhbHVlIGF0XHJcbiAgICAgICAgQHBhcmFtIHtTdHJpbmd9IGsgLSBLZXlcclxuICAgICAgICBAcGFyYW0gdiAtIFZhbHVlXHJcbiAgICAgICAgKi9cclxuICAgICAgICBpbnNlcnQ6IGZ1bmN0aW9uKGksayx2KSB7XHJcbiAgICAgICAgICAgIGlmICghdmFsc1trXSkge1xyXG4gICAgICAgICAgICAgICAga2V5cy5zcGxpY2UoaSwwLGspO1xyXG4gICAgICAgICAgICAgICAgdmFsc1trXSA9IHY7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9LFxyXG4gICAgICAgIC8qKlxyXG4gICAgICAgIFJldHVybiB0aGUgdmFsdWUgZm9yIHNwZWNpZmllZCBrZXkuXHJcbiAgICAgICAgQHBhcmFtIHtTdHJpbmd9IGsgLSBLZXlcclxuICAgICAgICAqL1xyXG4gICAgICAgIGdldDogZnVuY3Rpb24oaykge1xyXG4gICAgICAgICAgICAvLyBzdHJpbmcgLT4ga2V5XHJcbiAgICAgICAgICAgIHJldHVybiB2YWxzW2tdO1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgLyoqXHJcbiAgICAgICAgUmV0dXJuIHRoZSB2YWx1ZSBhdCBzcGVjaWZpZWQgaW5kZXggcG9zaXRpb24uXHJcbiAgICAgICAgQHBhcmFtIHtTdHJpbmd9IGkgLSBJbmRleFxyXG4gICAgICAgICovXHJcbiAgICAgICAgYXQ6IGZ1bmN0aW9uKGkpIHtcclxuICAgICAgICAgICAgLy8gbnVtYmVyIC0+IG50aCBvYmplY3RcclxuICAgICAgICAgICAgcmV0dXJuIHZhbHNba2V5c1tpXV07XHJcbiAgICAgICAgfSxcclxuICAgICAgICBsZW5ndGg6IGZ1bmN0aW9uKCl7cmV0dXJuIGtleXMubGVuZ3RoO30sXHJcbiAgICAgICAga2V5czogZnVuY3Rpb24oKXtyZXR1cm4ga2V5czt9LFxyXG4gICAgICAgIGtleTogZnVuY3Rpb24oaSkge3JldHVybiBrZXlzW2ldO30sXHJcbiAgICAgICAgdmFsdWVzOiBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGtleXMubWFwKGZ1bmN0aW9uKGtleSl7cmV0dXJuIHZhbHNba2V5XTt9KTtcclxuICAgICAgICB9LFxyXG4gICAgICAgIG1hcDogZnVuY3Rpb24oZnVuYykge1xyXG4gICAgICAgICAgICByZXR1cm4ga2V5cy5tYXAoZnVuY3Rpb24oayl7cmV0dXJuIGZ1bmMoaywgdmFsc1trXSk7fSk7XHJcbiAgICAgICAgfSxcclxuICAgICAgICB1bnNvcnRlZF9kaWN0OiBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHZhbHM7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8vIFV0aWxpdHkgZnVuY3Rpb25zIGZvciBtYXAvcmVkdWNlXHJcbmRkLm1hcCA9IHtcclxuICAgIGtleTogZnVuY3Rpb24oYXR0ciwgcmVtYXApIHtcclxuICAgICAgICByZXR1cm4gZnVuY3Rpb24oZCwgZW1pdCkge1xyXG4gICAgICAgICAgICB2YXIga2V5ID0gZFthdHRyXTtcclxuICAgICAgICAgICAgaWYgKHJlbWFwICYmIHJlbWFwW2tleV0gIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAga2V5ID0gcmVtYXBba2V5XTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbWl0KGtleSwgZCk7XHJcbiAgICAgICAgfTtcclxuICAgIH0sXHJcbiAgICBkaWN0OiBmdW5jdGlvbihkaWN0KSB7XHJcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGQsIGVtaXQpIHtcclxuICAgICAgICAgICAgZW1pdChkLCBkaWN0W2RdKTtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG59O1xyXG5kZC5lbWl0ID0ge1xyXG4gICAgaWRlbnQ6IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJldHVybiBmdW5jdGlvbihrZXksIHZhbHVlcywgZW1pdCkge1xyXG4gICAgICAgICAgICBlbWl0KGtleSwgdmFsdWVzKTtcclxuICAgICAgICB9O1xyXG4gICAgfSxcclxuICAgIGZpcnN0OiBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gZnVuY3Rpb24oa2V5LCB2YWx1ZXMsIGVtaXQpIHtcclxuICAgICAgICAgICAgZW1pdChrZXksIHZhbHVlc1swXSk7XHJcbiAgICAgICAgfTtcclxuICAgIH0sXHJcbiAgICBsYXN0OiBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gZnVuY3Rpb24oa2V5LCB2YWx1ZXMsIGVtaXQpIHtcclxuICAgICAgICAgICAgZW1pdChrZXksIHZhbHVlc1t2YWx1ZXMubGVuZ3RoIC0gMV0pO1xyXG4gICAgICAgIH07XHJcbiAgICB9LFxyXG4gICAgbWVyZ2U6IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJldHVybiBmdW5jdGlvbihrZXksIHZhbHVlcywgZW1pdCkge1xyXG4gICAgICAgICAgICB2YXIgb2JqID0gdmFsdWVzLnJlZHVjZShmdW5jdGlvbihwcmV2LCBjdXJyKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGN1cnIpO1xyXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaT0wOyBpPGtleXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgayA9IGtleXNbaV07XHJcbiAgICAgICAgICAgICAgICAgICAgcHJldltrXSA9IGN1cnJba107XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gcHJldjtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbWl0KGtleSwgb2JqKTtcclxuICAgICAgICB9O1xyXG4gICAgfSxcclxuICAgIHRvQXR0cjogZnVuY3Rpb24oYXR0ciwgZnVuYykge1xyXG4gICAgICAgIGZ1bmMgPSBmdW5jIHx8IGRkLmVtaXQubGFzdCgpO1xyXG4gICAgICAgIHJldHVybiBmdW5jdGlvbihrZXksIHZhbHVlcywgZW1pdCkge1xyXG4gICAgICAgICAgICBmdW5jKGtleSwgdmFsdWVzLCBmdW5jdGlvbihrLCB2KSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgb2JqID0ge307XHJcbiAgICAgICAgICAgICAgICBvYmpbYXR0cl0gPSB2O1xyXG4gICAgICAgICAgICAgICAgZW1pdChrLCBvYmopO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9O1xyXG4gICAgfSxcclxuICAgIHN1bTogZnVuY3Rpb24oaW5jbHVkZSwgZXhjbHVkZSkge1xyXG4gICAgICAgIGluY2x1ZGUgPSB3aWxkY2FyZHMoaW5jbHVkZSB8fCAnKicpO1xyXG4gICAgICAgIGV4Y2x1ZGUgPSB3aWxkY2FyZHMoZXhjbHVkZSk7ICAgICAgIFxyXG5cclxuICAgICAgICByZXR1cm4gZnVuY3Rpb24oa2V5LCB2YWx1ZXMsIGVtaXQpIHtcclxuICAgICAgICAgICAgdmFyIG9iaiA9IHZhbHVlcy5yZWR1Y2UoZnVuY3Rpb24ocHJldiwgY3Vycikge1xyXG4gICAgICAgICAgICAgICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhjdXJyKTtcclxuICAgICAgICAgICAgICAgIGZvciAodmFyIGk9MDsgaTxrZXlzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIGtleSA9IGtleXNbaV0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRvQWRkID0gZmFsc2UsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGo7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgZm9yIChqPTA7IGo8aW5jbHVkZS5sZW5ndGg7IGorKykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoa2V5LnNlYXJjaChpbmNsdWRlW2ldKSA+IC0xKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkb0FkZCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBmb3IgKGo9MDsgajxleGNsdWRlLmxlbmd0aDsgaisrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChrZXkuc2VhcmNoKGluY2x1ZGVbal0pID4gLTEpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRvQWRkID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBpZiAoZG9BZGQgJiYgcHJldltrZXldICYmIGN1cnJba2V5XSAmJiAhaXNOYU4ocHJldltrZXldKSAmJiAhaXNOYU4oY3VycltrZXldKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBwcmV2W2tleV0gPSBwcmV2W2tleV0gKyBjdXJyW2tleV07XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBwcmV2W2tleV0gPSBjdXJyW2tleV07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkb0FkZCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKFwiZGF0YWRhdGEuZW1pdC5zdW0oKTogQ2Fubm90IGFkZCBrZXlzIFwiICsga2V5ICsgXCIhXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHByZXY7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZW1pdChrZXksIG9iaik7XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxufTtcclxuXHJcbmRkLm1hcC5nZW8gPSB7XHJcbiAgICBwb2ludDogZnVuY3Rpb24obGF0UHJvcCwgbG9uUHJvcCwga2V5UHJvcCkge1xyXG4gICAgICAgIHZhciBpZCA9IDA7XHJcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGQsIGVtaXQpIHtcclxuICAgICAgICAgICAgdmFyIGtleSA9IGtleVByb3AgPyBkW2tleVByb3BdIDogaWQrKztcclxuICAgICAgICAgICAgZW1pdChrZXksIGRkLmdlby5Qb2ludChkW2xvblByb3BdLCBkW2xhdFByb3BdLCBkKSk7XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxufTtcclxuXHJcbmRkLmVtaXQuZ2VvID0ge1xyXG4gICAgc2VnbWVudHM6IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJldHVybiBmdW5jdGlvbihrZXksIGRhdGEsIGVtaXQpIHtcclxuICAgICAgICAgICAgdmFyIHByZXYgPSBudWxsLCBjdXIgPSBudWxsO1xyXG4gICAgICAgICAgICBmb3IgKHZhciBpPTA7IGk8ZGF0YS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgY3VyID0gZGF0YVtpXTtcclxuICAgICAgICAgICAgICAgIGlmIChwcmV2KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZW1pdChrZXkgKyAnLScgKyBpLCBkZC5nZW8uTGluZVN0cmluZyhbW3ByZXYubG9uLHByZXYubGF0XSxbY3VyLmxvbixjdXIubGF0XV0sIHByZXYpKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHByZXYgPSBjdXI7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG4gICAgfVxyXG59O1xyXG5cclxuLy8gY29uc3RydWN0b3JzIGZvciBHZW9KU09OIG9iamVjdHNcclxuZGQuZ2VvID0ge1xyXG4gICAgUG9pbnQ6IGZ1bmN0aW9uKGxvbiwgbGF0LCBwcm9wZXJ0aWVzKSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgdHlwZTogJ0ZlYXR1cmUnLFxyXG4gICAgICAgICAgICBnZW9tZXRyeToge1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ1BvaW50JyxcclxuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzOiBbbG9uLCBsYXRdXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIHByb3BlcnRpZXM6IHByb3BlcnRpZXNcclxuICAgICAgICB9O1xyXG4gICAgfSxcclxuICAgIExpbmVTdHJpbmc6IGZ1bmN0aW9uKGNvb3JkaW5hdGVzLCBwcm9wZXJ0aWVzKSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgdHlwZTogJ0ZlYXR1cmUnLFxyXG4gICAgICAgICAgICBnZW9tZXRyeToge1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ0xpbmVTdHJpbmcnLFxyXG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXM6IGNvb3JkaW5hdGVzXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIHByb3BlcnRpZXM6IHByb3BlcnRpZXNcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG59O1xyXG5cclxuZnVuY3Rpb24gd2lsZGNhcmRzKHNwZWMpIHtcclxuICAgIHNwZWMgPSBkZC50b0FycmF5KHNwZWMpO1xyXG4gICAgZm9yICh2YXIgaT0wOyBpPHNwZWMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBpZiAoIShzcGVjW2ldIGluc3RhbmNlb2YgUmVnRXhwKSkge1xyXG4gICAgICAgICAgICBzcGVjW2ldID0gbmV3IFJlZ0V4cCgnXicgKyBzcGVjW2ldLnJlcGxhY2UoJyonLCcuKicpLnJlcGxhY2UoJz8nLCcuJykpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiBzcGVjO1xyXG59XHJcblxyXG4vLyBodHRwczovL2NvZGUuZ29vZ2xlLmNvbS9wL21hcHJlZHVjZS1qcy9cclxuLy8gTW96aWxsYSBQdWJsaWMgTGljZW5zZVxyXG5kZC5tYXByZWR1Y2UgPSBmdW5jdGlvbiAoZGF0YSwgbWFwLCByZWR1Y2UpIHtcclxuXHR2YXIgbWFwUmVzdWx0ID0gW10sXHJcbiAgICAgICAgcmVkdWNlUmVzdWx0ID0gZGQuT3JkZXJlZEhhc2goKSxcclxuICAgICAgICByZWR1Y2VLZXk7XHJcblx0XHJcbiAgICByZWR1Y2UgPSByZWR1Y2UgfHwgZGQuZW1pdC5sYXN0KCk7IC8vIGRlZmF1bHRcclxuICAgIFxyXG5cdHZhciBtYXBFbWl0ID0gZnVuY3Rpb24oa2V5LCB2YWx1ZSkge1xyXG5cdFx0aWYoIW1hcFJlc3VsdFtrZXldKSB7XHJcblx0XHRcdG1hcFJlc3VsdFtrZXldID0gW107XHJcblx0XHR9XHJcblx0XHRtYXBSZXN1bHRba2V5XS5wdXNoKHZhbHVlKTtcclxuXHR9O1xyXG5cdFxyXG5cdHZhciByZWR1Y2VFbWl0ID0gZnVuY3Rpb24oa2V5LCB2YWx1ZSkge1xyXG5cdFx0cmVkdWNlUmVzdWx0LnB1c2goa2V5LCB2YWx1ZSk7XHJcblx0fTtcclxuXHRcclxuXHRmb3IodmFyIGkgPSAwOyBpIDwgZGF0YS5sZW5ndGg7IGkrKykge1xyXG5cdFx0bWFwKGRhdGFbaV0sIG1hcEVtaXQpO1xyXG5cdH1cclxuXHRcclxuXHRmb3IocmVkdWNlS2V5IGluIG1hcFJlc3VsdCkge1xyXG5cdFx0cmVkdWNlKHJlZHVjZUtleSwgbWFwUmVzdWx0W3JlZHVjZUtleV0sIHJlZHVjZUVtaXQpO1xyXG5cdH1cclxuXHRcclxuXHRyZXR1cm4gcmVkdWNlUmVzdWx0O1xyXG59O1xyXG5cclxuZGQubWFwcmVkdWNlciA9IGZ1bmN0aW9uKG1hcCwgcmVkdWNlKSB7XHJcbiAgICByZXR1cm4gZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgICAgIGRkLm1hcHJlZHVjZShkYXRhLCBtYXAsIHJlZHVjZSk7XHJcbiAgICB9O1xyXG59O1xyXG4vLyBIZWxwZXIgZnVuY3Rpb25zIGZvciBtYXAgZXRjLlxyXG5cclxuLy8gcHV0ICdkJyBpbiBhbm90aGVyIG9iamVjdCB1c2luZyB0aGUgYXR0cmlidXRlICdrZXknXHJcbi8vIG9wdGlvbmFsICdwdWxsJyBpcyB0aGUgbmFtZSBvZiBhIGtleSB0byBsZWF2ZSBvbiB0aGUgdG9wIGxldmVsIFxyXG5kZC5lbnZlbG9wZSA9IGZ1bmN0aW9uKGtleSwgcHVsbCwgZnVuYykge1xyXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGQpIHtcclxuICAgICAgICBpZiAocHVsbCAmJiB0eXBlb2YgcHVsbCA9PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgIC8vIGVudmVsb3BlKGtleSwgZnVuYykgY2FzZVxyXG4gICAgICAgICAgICBmdW5jID0gcHVsbDtcclxuICAgICAgICAgICAgcHVsbCA9IG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChmdW5jKSBkID0gZnVuYyhkKTtcclxuICAgICAgICB2YXIgdmFsID0ge307XHJcbiAgICAgICAgdmFsW2tleV0gPSBkO1xyXG4gICAgICAgIGlmIChwdWxsKSB7XHJcbiAgICAgICAgICAgIHZhbFtwdWxsXSA9IGRbcHVsbF07XHJcbiAgICAgICAgICAgIGRlbGV0ZSBkW3B1bGxdO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdmFsO1xyXG4gICAgfTtcclxufTtcclxuZGQucHJlZml4ID0gZnVuY3Rpb24ocHJlZml4LCBmdW5jKSB7XHJcbiAgICByZXR1cm4gZnVuY3Rpb24oZCkge1xyXG4gICAgXHJcbiAgICAgICAgaWYgKGZ1bmMpIGQgPSBmdW5jKGQpO1xyXG4gICAgXHJcbiAgICAgICAgdmFyIHZhbCA9IHt9LFxyXG4gICAgICAgICAgICBrZXlzID0gT2JqZWN0LmtleXMoZCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGk9MDsgaTxrZXlzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIHZhbFtwcmVmaXggKyBrZXlzW2ldXSA9IGRba2V5c1tpXV07XHJcbiAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICByZXR1cm4gdmFsO1xyXG4gICAgfTtcclxufTtcclxuZGQucHJlZml4X2F0dHIgPSBmdW5jdGlvbihhdHRyLCBmdW5jKSB7XHJcbiAgICByZXR1cm4gZnVuY3Rpb24oZCkge1xyXG4gICAgXHJcbiAgICAgICAgaWYgKGZ1bmMpIGQgPSBmdW5jKGQpO1xyXG4gICAgXHJcbiAgICAgICAgdmFyIHZhbCA9IHt9LFxyXG4gICAgICAgICAgICBrZXlzID0gT2JqZWN0LmtleXMoZCksXHJcbiAgICAgICAgICAgIHByZWZpeCA9IGRbYXR0cl0gPyBkW2F0dHJdICsgJ18nIDogJyc7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGk9MDsgaTxrZXlzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIHZhbFtwcmVmaXggKyBrZXlzW2ldXSA9IGRba2V5c1tpXV07XHJcbiAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICByZXR1cm4gdmFsO1xyXG4gICAgfTtcclxufTtcclxuZGQubWFwX2F0dHIgPSBmdW5jdGlvbihtYXAsIGZ1bmMpIHtcclxuICAgIHJldHVybiBmdW5jdGlvbihkKSB7XHJcbiAgICBcclxuICAgICAgICBpZiAoZnVuYykgZCA9IGZ1bmMoZCk7XHJcbiAgICBcclxuICAgICAgICBpZiAodHlwZW9mIG1hcCA9PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgIGQgPSBtYXAoZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG1hcCk7XHJcbiAgICAgICAgICAgIGZvciAodmFyIGk9MDsgaTxrZXlzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIga2V5ID0ga2V5c1tpXTtcclxuICAgICAgICAgICAgICAgIHZhciB2YWwgPSBtYXBba2V5XTtcclxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsID09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgICAgICBkW2tleV0gPSB2YWwoZCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChkW3ZhbF0pIHtcclxuICAgICAgICAgICAgICAgICAgICBkW2tleV0gPSBkW3ZhbF07XHJcbiAgICAgICAgICAgICAgICAgICAgZGVsZXRlIGRbdmFsXTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGQ7XHJcbiAgICB9O1xyXG59O1xyXG5kZC5yZXZlcnNlID0gZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgaWYgKGRhdGEuc2xpY2UgJiYgdHlwZW9mIGRhdGEuc2xpY2UgPT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIC8vIHNsaWNlKCkgPSBjb3B5XHJcbiAgICAgICAgcmV0dXJuIGRhdGEuc2xpY2UoKS5yZXZlcnNlKCk7IFxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGRhdGE7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGRkO1xyXG4iXX0=

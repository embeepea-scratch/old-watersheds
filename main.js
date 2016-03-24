require('./style.css');
require('./libs/leaflet/leaflet.js');
require('./libs/leaflet/leaflet.css');
require('./libs/Leaflet.CanvasLayer/leaflet_canvas_layer.js');

var sprintf = require('sprintf');
var tu = require('./topojson_utils.js');

var watersheds = {};

function renderLineString(ctx, lineString, map, topo) {
    var first = true;
    var i;
    for (i=0; i<lineString.length; ++i) {
        tu.walkarc(topo, lineString[i], map, ctx, first);
        first = false;
    }
}

function renderStream(ctx, geom, map, topo) {
    if (geom.style.lineWidth <= 0) { return; }
    ctx.lineWidth = geom.style.lineWidth;
    ctx.strokeStyle = geom.style.strokeStyle;
    ctx.beginPath();
    if (geom.type === 'LineString') {
        renderLineString(ctx, geom.arcs, map, topo);
    } else if (geom.type === 'MultiLineString') {
        geom.arcs.forEach(function(lineString) {
            renderLineString(ctx, lineString, map, topo);
        });
    }
    ctx.stroke();
}

function renderPolygon(ctx, geom, map, topo) {
    geom.forEach(function(ring) {
        var first = true;
        ring.forEach(function(i) {
            tu.walkarc(topo, i, map, ctx, first);
            first = false;
        });
        ctx.closePath();
    });
}

function renderHuc(ctx, geom, map, topo) {
    if ('fillStyle' in geom.style) {
        ctx.fillStyle   = geom.style.fillStyle;
    }
    if (geom.style.lineWidth > 0) {
        ctx.strokeStyle = geom.style.strokeStyle;
    }
    ctx.beginPath();
    if (geom.type === "Polygon") {
        renderPolygon(ctx, geom.arcs, map, topo);
    } else if (geom.type === "MultiPolygon") {
        geom.arcs.forEach(function(polygon) {
            renderPolygon(ctx, polygon, map, topo);
        });
    }
    if ('fillStyle' in geom.style) { ctx.fill(); }
    if (geom.style.lineWidth > 0) { ctx.stroke(); }
}

function downstream(geom, geomByH12Code, f) {
    f(geom);
    if (geom.properties.TOHUC in geomByH12Code) {
        downstream(geomByH12Code[geom.properties.TOHUC], geomByH12Code, f);
    }
}

function upstream(geom, geomByH12Code, f) {
    f(geom);
    if ('FROMHUCS' in geom.properties) {
        geom.properties.FROMHUCS.forEach(function(id) {
            upstream(geomByH12Code[id],geomByH12Code,f);
        });
    }
}

watersheds.launch = function(options) {
    var defaults = {
        // // center of conus, zoomed out to see almost all of it:
        // map_center: [39.0,-99.0],
        // map_zoom:   5
        // NC:
        map_center: [35.0,-82.0],
        map_zoom:   9
    };
    options = $.extend({}, defaults, options);

    var div = options.div;
    if (div instanceof jQuery) {
        div = div[0];
    }

    var mbUrl = "https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}@2x.png?access_token=" + options.mapbox_token;

    var streets     = L.tileLayer(mbUrl, {id: 'mapbox.streets'}),
        satellite   = L.tileLayer(mbUrl, {id: 'mapbox.streets-satellite'}),
        hydro       = L.tileLayer("http://basemap.nationalmap.gov/arcgis/rest/services/USGSHydroNHD/MapServer/tile/{z}/{y}/{x}");

    var baseLayers = {
        "Streets": streets,
        "Satellite": satellite,
        "Hydrology": hydro
    };

    var map = L.map(div, {
        attributionControl: false,
        maxZoom: 14,
        minZoom: 2,
        layers: [streets],
        zoomControl: false,
        zoomAnimation: false
    });

    L.control.attribution({position: 'topright', prefix: ''}).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);

    map.setView(options.map_center, options.map_zoom);

    var geomByH12Code = {};
    var hucStreamIndex = {};
    var requests = [
        $.ajax({
            url: 'data/huc-stream-index.json',
            dataType: 'json',
            method: 'GET',
            success: function(hsi) {
                hucStreamIndex = hsi;
            }
        }),
        $.ajax({
            url: 'data/h12.topojson',
            //url: 'data/h12-03s.topojson',
            dataType: 'json',
            method: 'GET',
            success: function(topo) {
                topo.decodedArcs = topo.arcs.map(function(arc) { return tu.decodeArc(topo, arc); });
                topo.objects['h12'].geometries.forEach(function(geom) {
                    if (geom.id) {
                        geomByH12Code[geom.id] = geom;
                    }
                    geom.properties.FROMHUCS = [];
                    geom.bbox = tu.geom_bbox(geom, topo);
                });
                topo.objects["h12"].geometries.forEach(function(geom) {
                    if (geom.properties.TOHUC in geomByH12Code) {
                        geomByH12Code[geom.properties.TOHUC].properties.FROMHUCS.push(geom.id);
                    }
                });
            }
        }),
        $.ajax({
            url: 'data/streams.topojson',
            dataType: 'json',
            method: 'GET',
            success: function(topo) {
                topo.decodedArcs = topo.arcs.map(function(arc) { return tu.decodeArc(topo, arc); });
                topo.objects['streams'].geometries.forEach(function(geom) {
                    geom.bbox = tu.geom_bbox(geom, topo);
                });
            }
        })
    ];

    var mapState = {
        last_move: undefined,
        last_move_set: false,
        last_click: undefined,
        last_click_set: false,
        last_target_geom: undefined,
        frozen: false
    };

    $.when.apply($, requests).then(function(hsiResult, h12Result, streamsResult) {
        var streamsTopo = streamsResult[0];
        var streamGeoms = streamsTopo.objects['streams'].geometries;
        var h12Topo     = h12Result[0];
        var h12Geoms    = h12Topo.objects['h12'].geometries;
        var hucsInView  = [];
        function setTargetGeomStyles(targetGeom) {
            upstream(targetGeom, geomByH12Code, function(geom) {
                geom.style = {
                    lineWidth: 0,
                    fillStyle: tu.rgba(255,0,0,0.3)
                };
                if (geom.id in hucStreamIndex) {
                    hucStreamIndex[geom.id].forEach(function(streamIndex) {
                        streamGeoms[streamIndex].style = {
                            lineWidth: 2,
                            strokeStyle: tu.rgba(255,0,0,1.0)
                        };
                    });
                }
            });
            downstream(targetGeom, geomByH12Code, function(geom) {
                geom.style = {
                    lineWidth: 0,
                    fillStyle: tu.rgba(0,0,255,0.3)
                };
                if (geom.id in hucStreamIndex) {
                    hucStreamIndex[geom.id].forEach(function(streamIndex) {
                        streamGeoms[streamIndex].style = {
                            lineWidth: 2,
                            strokeStyle: tu.rgba(0,0,255,1.0)
                        };
                    });
                }
            });
            targetGeom.style = {
                lineWidth: 1,
                strokeStyle: tu.rgba(0,0,0,0.5),
                fillStyle: tu.rgba(255,255,0,0.3)
            };
            if (targetGeom.id in hucStreamIndex) {
                hucStreamIndex[targetGeom.id].forEach(function(streamIndex) {
                    streamGeoms[streamIndex].style = {
                        lineWidth: 2,
                        strokeStyle: tu.rgba(128,128,0,1.0)
                    };
                });
            }
        }
        function clearTargetGeomStyles(targetGeom) {
            upstream(targetGeom, geomByH12Code, function(geom) {
                delete geom.style;
                if (geom.id in hucStreamIndex) { hucStreamIndex[geom.id].forEach(function(streamIndex) { delete streamGeoms[streamIndex].style; }); }
            });
            downstream(targetGeom, geomByH12Code, function(geom) {
                delete geom.style;
                if (geom.id in hucStreamIndex) { hucStreamIndex[geom.id].forEach(function(streamIndex) { delete streamGeoms[streamIndex].style; }); }
            });
        }
        var canvasLayer = new (L.CanvasLayer.extend({
            render: function() {
                var map = this._map;
                var canvas = this.getCanvas();
                var ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                var bds = map.getBounds();
                var extent = [[bds.getWest(), bds.getEast()],[bds.getSouth(),bds.getNorth()]];
                var numHucsInView = 0;
                var geomUnderMouseMove = undefined;
                var i;
                if (mapState.last_move_set && mapState.last_target_geom) {
                    clearTargetGeomStyles(mapState.last_target_geom);
                    mapState.last_target_geom = undefined;
                }
                h12Geoms.forEach(function(geom) {
                    if (tu.boxes_overlap(geom.bbox, extent)) {
                        hucsInView[numHucsInView++] = geom;
                        if (mapState.last_move_set && tu.point_in_geom2d(mapState.last_move, geom, h12Topo)) {
                            geomUnderMouseMove = geom;
                        }
                    }
                });
                if (geomUnderMouseMove) {
                    setTargetGeomStyles(geomUnderMouseMove);
                    mapState.last_target_geom = geomUnderMouseMove;
                }
                for (i=0; i<numHucsInView; ++i) {
                    if (hucsInView[i].style) {
                        renderHuc(ctx, hucsInView[i], map, h12Topo);
                    }
                };
                streamGeoms.forEach(function(geom) {
                    if (geom.style && tu.boxes_overlap(geom.bbox, extent)) {
                        renderStream(ctx, geom, map, streamsTopo);
                    }
                });

                mapState.last_move_set = false;
                mapState.last_click_set = false;
            }
        }))();
        map.addLayer(canvasLayer);
        map.on('click', function(e) {
             mapState.frozen = !mapState.frozen;
        });
        map.on('mousemove', function(e) {
            if (mapState.frozen) { return; }
            var ll = e.latlng;
            mapState.last_move = [ll.lng, ll.lat];
            mapState.last_move_set = true;
            canvasLayer.render();
        });
    });

    window.getextent = function() {
        var b = map.getBounds();
        var lat = (b.getNorth() + b.getSouth())/2;
        var lon = (b.getEast() + b.getWest())/2;
        console.log(JSON.stringify({map: { center: [lat,lon], zoom: map.getZoom() }}));
    };
};

window.watersheds = watersheds;

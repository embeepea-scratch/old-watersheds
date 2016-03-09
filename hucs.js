function rgba(r,g,b,a) {
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
}
function rgb(r,g,b) {
    return "rgb(" + r + "," + g + "," + b + ")";
}

var polygon_alpha = 0.5;
var red_colors = [
    sprintf("rgba(%1d,%1d,%1d,%.2f)", 255,245,240,polygon_alpha),
    sprintf("rgba(%1d,%1d,%1d,%.2f)", 254,224,210,polygon_alpha),
    sprintf("rgba(%1d,%1d,%1d,%.2f)", 252,187,161,polygon_alpha),
    sprintf("rgba(%1d,%1d,%1d,%.2f)", 252,146,114,polygon_alpha),
    sprintf("rgba(%1d,%1d,%1d,%.2f)", 251,106, 74,polygon_alpha),
    sprintf("rgba(%1d,%1d,%1d,%.2f)", 239, 59, 44,polygon_alpha),
    sprintf("rgba(%1d,%1d,%1d,%.2f)", 203, 24, 29,polygon_alpha),
    sprintf("rgba(%1d,%1d,%1d,%.2f)", 165, 15, 21,polygon_alpha),
    sprintf("rgba(%1d,%1d,%1d,%.2f)", 103,  0, 13,polygon_alpha)
];
var red_color_i = red_colors.length-1;
function reset_red_colors() {
    red_color_i = red_colors.length-1;
}
function next_red_color() {
    red_color_i = (red_color_i + 1) % red_colors.length;
    return red_colors[red_color_i];
}

$(document).ready(function() {

    var map = L.map('map', {
        attributionControl: false,
        zoomAnimation: false,
        maxZoom: 18,
        minZoom: 2
    });

    L.control.attribution({position: 'topright', prefix: ''}).addTo(map);


    L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
        attribution: '',
        maxZoom: 18,
        id: 'mapbox.streets',
        // the following access token is for mapbox account 'embeepea' (mbp@geomtech.com), created Tue Aug 11 2015:
        accessToken: 'pk.eyJ1IjoiZW1iZWVwZWEiLCJhIjoiZTIyMTc1MmFkOWYwODI3MTYwMmY3MDU0NTYxNmYxZWUifQ.hm8HaatuyBAdwRWiYYYBZw'
    }).addTo(map);


    map.setView([36.1, -92.0], 6);

    //  //$.getJSON('h12-50000-5e4.s.topojson', function(topo) {
    //  $.getJSON('newh.topojson', function(topo) {
    //      topojsonCanvasLayer(map, topo, {
    //          zoomLevelToLayerName: function (zoomLevel) {
    //              if (zoomLevel >= 10) {
    //                  return "h12";
    //              } else if (zoomLevel >= 9) {
    //                  return "h10";
    //              } else if (zoomLevel >= 8) {
    //                  return "h8";
    //              } else if (zoomLevel >= 7) {
    //                  return "h6";
    //              } else if (zoomLevel >= 6) {
    //                  return "h4";
    //              }
    //              return "h2";
    //              /*
    //              if (zoomLevel >= 14) {
    //                  return "parcels";
    //              } else if (zoomLevel >= 12) {
    //                  return "parcelgroups";
    //              }
    //              return "counties";
    //              */
    //          },
    //          onClick: function(geom) {
    //              console.log(geom);
    //          }
    //      }).addTo(map);
    //  });

    var defaultStyleFunc = function(geom) {
        if (geom.selected) {
            return {
                lineWidth:   1,
                fillStyle:   rgba(255,255,0,0.4),
                strokeStyle: rgba(0,0,0,0.5)
            };
        }
        if (geom.up) {
            return {
                lineWidth:   0,
                fillStyle:   rgba(255,0,0,0.4),
                //strokeStyle: rgba(0,0,0,0.5)
            };
        }
        if (geom.down) {
            return {
                lineWidth:   0,
                fillStyle:   rgba(0,0,255,0.4),
                //strokeStyle: rgba(0,0,0,0.5)
            };
        }
        return undefined;
    };

    function zoomLevelToLayerName(zoomLevel) {
        return "h12";
        if (zoomLevel >= 10) {
            return "h12";
        } else if (zoomLevel >= 9) {
            return "h10";
        } else if (zoomLevel >= 8) {
            return "h8";
        } else if (zoomLevel >= 7) {
            return "h6";
        } else if (zoomLevel >= 6) {
            return "h4";
        }
        return "h2";
    }

    var allgeoms = {};

    function downstream(geom, f) {
        f(geom);
        if (geom.properties.TOHUC in allgeoms) {
            downstream(allgeoms[geom.properties.TOHUC], f);
        }
    }

    function upstream(geom, f) {
        f(geom);
        if ('FROMHUCS' in geom.properties) {
            geom.properties.FROMHUCS.forEach(function(id) {
                upstream(allgeoms[id],f);
            });
        }
    }

    var frozen = false;


    var lastSelectedGeom;
    $.getJSON('h12.topojson', function(topo) {

        topo.objects["h12"].geometries.forEach(function(geom) {
            allgeoms[geom.id] = geom;
            geom.properties.FROMHUCS = [];
        });
        topo.objects["h12"].geometries.forEach(function(geom) {
            if (geom.properties.TOHUC in allgeoms) {
                allgeoms[geom.properties.TOHUC].properties.FROMHUCS.push(geom.id);
            }
        });

        var dataLayer = topojsonCanvasLayer(map, topo, {
            zoomLevelToLayerName: zoomLevelToLayerName,
            zoomLevelToClickLayerName: zoomLevelToLayerName,
            onClick: function(geom, p) {
                console.log(geom);
                frozen = !frozen;
                return;
                if (lastSelectedGeom) {
                    lastSelectedGeom.selected = false;
                }
                geom.selected = true;
                lastSelectedGeom = geom;
                dataLayer.render();
                console.log(p);
            },
            onMove: function(geom, p) {
                if (frozen) { return; }
                topo.objects["h12"].geometries.forEach(function(g) {
                    g.up = false;
                    g.down = false;
                    g.selected = false;
                });

                // mark all downstream:
                downstream(geom, function(g) { g.down = true; });
                upstream(geom, function(g) { g.up = true; });
                geom.selected = true;
/*
                var id = geom.id;
                while (id in allgeoms) {
                    allgeoms[id].selected = true;
                    id = allgeoms[id].properties.TOHUC;
                }
*/

                // mark all upstream:
                //id = geom.id;



                dataLayer.render();
            },
            zoomLevelToLayerStyleFunctions: function (zoomLevel) {
                var layerName = zoomLevelToLayerName(zoomLevel);
                var style = {};
                style[layerName] = defaultStyleFunc;
                return style;
            }
        });
        dataLayer.addTo(map);

        var fadeTime = 2000;
        $('#waitmessage').html("ready!");
        $('#map').hide();
        $('#map').removeClass("dimmed");
        $('#map').fadeIn(fadeTime);
        $('#waitmessage').fadeOut(fadeTime, function() {
            $('#waitmessage').hide();
        });


    });

});

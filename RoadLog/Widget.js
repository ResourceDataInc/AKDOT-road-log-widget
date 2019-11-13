///////////////////////////////////////////////////////////////////////////
//Road Log Widget
///////////////////////////////////////////////////////////////////////////
define([
    "dojo/_base/array",
    "dojo/_base/declare",
    "dojo/_base/lang",
    "dojo/Deferred",
    "dojo/DeferredList",
    "dojo/dom-attr",
    "dojo/dom-construct",
    "dojo/dom-style",
    "dojo/string",
    "dijit/form/CheckBox",
    "dijit/form/Select",
    "jimu/LayerStructure",
    "jimu/SelectionManager",
    'jimu/CSVUtils',
    "esri/Color",
    "esri/graphicsUtils",
    "esri/layers/FeatureLayer",
    "esri/renderers/SimpleRenderer",
    "esri/symbols/PictureMarkerSymbol",
    "esri/symbols/SimpleLineSymbol",
    "esri/symbols/SimpleMarkerSymbol",
    "esri/tasks/FeatureSet",
    "esri/tasks/QueryTask",
    "esri/tasks/query",
    "./lrscommon/js/form/MeasurePicker",
    "./lrscommon/js/form/RoutePicker",
    "./lrscommon/js/LrsWidget",
    "./lrscommon/js/tasks/serviceInfoCache",
    "./lrscommon/js/util/domain",
    "./lrscommon/js/util/geometry",
    "./lrscommon/js/util/i18n",
    "./lrscommon/js/util/routeName",
    "./lrscommon/js/util/utils",
    "dojo/promise/Promise",
    "dojo/promise/all"

], function(
    array, declare, lang, Deferred, DeferredList, domAttr, domConstruct, domStyle, string, CheckBox, Select, LayerStructure, SelectionManager,
    CSVUtils, Color, graphicsUtils, FeatureLayer, SimpleRenderer, PictureMarkerSymbol, SimpleLineSymbol, SimpleMarkerSymbol, FeatureSet, QueryTask, Query,
    MeasurePicker, RoutePicker, LrsWidget, serviceInfoCache, domainUtils, geometryUtils, i18nUtils, routeNameUtils, utils, Promise, all
) {
    return declare([LrsWidget], {

        baseClass: 'jimu-widget-lrswidget',
        _networkLayer: null,
        _eventLayerCheckboxes: null,
        _layerStructure: null,
        _overlayLayerNodeId: null,
        _searchByName: true,

        _onLrsLoaded: function() {
            this._layerStructure = LayerStructure.getInstance();
            this._setRouteInputConfig();
            this._setMeasureInputConfig();
            this._populateNetworkSelect();
            this._getAttributeConfig().then(lang.hitch(this, function(json) {
              this._populateEventLayers(json)
            }));
            this.showContent();
        },

        _setRouteInputConfig: function() {
            array.forEach([this._fromRouteInput, this._toRouteInput], function(routeInput) {
                routeInput.selectOnGraphicsLayer = true;
                routeInput.set("config", {
                    mapManager: this._mapManager
                });
            }, this);
            this._toRouteInput.set("fromRouteForm", this._fromRouteInput);
            this._fromRouteInput.set("toRouteForm", this._toRouteInput);
        },

        _setMeasureInputConfig: function() {
            this._fromMeasureInput.set("config", {
                mapManager: this._mapManager,
                routeInput: this._fromRouteInput
            });
            this._fromMeasureInput.set("selectionSymbol", this._mapManager.getFromMeasureSymbol());
            this._fromMeasureInput.set("measurePrecision", this._mapManager.measurePrecision);

            this._toMeasureInput.set("config", {
                mapManager: this._mapManager,
                routeInput: this._toRouteInput
            });
            this._toMeasureInput.set("selectionSymbol", this._mapManager.getToMeasureSymbol());
            this._toMeasureInput.set("measurePrecision", this._mapManager.measurePrecision);
        },

        _populateNetworkSelect: function() {
            this._networkSelect.removeOption(this._networkSelect.getOptions());
            var networkLayers = this._mapManager.lrsServiceConfig.networkLayers;
            var options = [];
            array.forEach(networkLayers, function(networkLayer) {
                options.push({
                    label: networkLayer.name,
                    value: networkLayer.id.toString()
                });
            });
            this._networkSelect.addOption(options);
            this._onNetworkSelectChange();
        },

        _onNetworkSelectChange: function() {
            var networkLayer = utils.findLayer(this._networkSelect.get("value"), this._mapManager.lrsServiceConfig.networkLayers);
            if (networkLayer && networkLayer != this._networkLayer) {
                this.set("networkLayer", networkLayer);
            }
        },

        _setNetworkLayerAttr: function(val) {
            if (this._networkLayer != val) {
              //Search by Route Name is default
              val.routeNameFieldName = "Route_Name"
              //
              this._networkLayer = val;
              this._makeNetworkLayerVisible();
              this._fromRouteInput.set("networkLayer", this._networkLayer);

              if (this._networkLayer.supportsLines) {
                  this._toRouteInput.makeRouteSelections = true;
                  this._toRouteInput.set("networkLayer", this._networkLayer);
                  this._toMeasureInput.set("routeInput", this._toRouteInput);
                  domStyle.set(this._toRouteDiv, "display", "table-row");
                  domAttr.set(this._fromRouteLabel, "innerHTML", routeNameUtils.getFromRouteLabel(this._networkLayer));
                  domAttr.set(this._toRouteLabel, "innerHTML", routeNameUtils.getToRouteLabel(this._networkLayer));
              } else {
                  this._toRouteInput.clearSelection();
                  this._toMeasureInput.set("routeInput", this._fromRouteInput);
                  this._toRouteInput.makeRouteSelections = false;
                  this._toRouteInput.deactivate();
                  this._toRouteInput.setRouteValues({
                      routeId: null,
                      routeName: null,
                      routeFeature: null
                  }, false);
                  domStyle.set(this._toRouteDiv, "display", "none");
                  domAttr.set(this._fromRouteLabel, "innerHTML", routeNameUtils.getRouteLabel(this._networkLayer));
              }
              domAttr.set(this._fromMeasureLabel, "innerHTML", string.substitute(this.nls.fromMeasureWithUnits, [utils.getUnitsString(this._networkLayer.unitsOfMeasure, true)]));
              domAttr.set(this._toMeasureLabel, "innerHTML", string.substitute(this.nls.toMeasureWithUnits, [utils.getUnitsString(this._networkLayer.unitsOfMeasure, true)]));
          }
        },

        /*
         * Makes the selected network layer visible on the map if it isn't already
         */
        _makeNetworkLayerVisible: function() {
            var layerId = this._networkLayer ? this._networkLayer.id : null;
            this._mapManager.makeLrsLayerVisible(layerId);
        },

        /*
         * Functions to change the search by settings
         */
        _searchByName: function() {
          this._networkLayer.routeNameFieldName = "Route_Name";
          domAttr.set(this._fromRouteLabel, "innerHTML", routeNameUtils.getRouteLabel(this._networkLayer));
          this._fromRouteInput.set("networkLayer", this._networkLayer);
          this._fromRouteInput._routeInput.required = false;
          this._fromRouteInput._routeInput.set("value", "");
          this._fromRouteInput._routeInput.set("routeId", null);
          this._fromRouteInput._routeInput.set("routeName", null);
          this._fromRouteInput._routeInput.required = true;
          },

        _searchById: function() {
          this._networkLayer.routeNameFieldName = null;
          domAttr.set(this._fromRouteLabel, "innerHTML", routeNameUtils.getRouteLabel(this._networkLayer));
          this._fromRouteInput.set("networkLayer", this._networkLayer);
          this._fromRouteInput._routeInput.required = false;
          this._fromRouteInput._routeInput.set("value", "");
          this._fromRouteInput._routeInput.set("routeId", null);
          this._fromRouteInput._routeInput.set("routeName", null);
          this._fromRouteInput._routeInput.required = true;
          },

          /*
           * Creates the Search By Radio Buttons
           */
          _populateEventLayers: function(json) {
              var eventsDiv = "_eventsDiv";
              var eventLayers = this._mapManager.lrsServiceConfig.eventLayers;
              var intersectionLayers = this._mapManager.lrsServiceConfig.intersectionLayers;
              var unfilteredEvents = eventLayers.concat(intersectionLayers);

              //Filter by config file
              var intersectionjson = json.IntersectionLayers.map(function(layer){
                  return layer.Name;
                });
              var eventjson = json.EventLayers.map(function(layer){
                  return layer.Name;
                })
              jsonArray = eventjson.concat(intersectionjson);

              var filteredEvents = unfilteredEvents.filter(function(s){
                  if (jsonArray.includes(s.name)) {
                    return true;
                  }
                  else {
                    return false;
                  }
                });

              //Sort alphabetically
              filteredEvents.sort(function(a, b) {
                  if (a.name < b.name) {
                    return -1;
                  }
                  if (a.name > b.name) {
                    return 1;
                  }
                  // names must be equal
                  return 0;
                });

                var half = filteredEvents.length/2;
                this._eventLayerCheckboxes = array.map(filteredEvents, function(eventLayer, i) {
                    var parent = eventsDiv + (i < half ? "1":"2");
                    parent = eventsDiv + "1";
                    var label = domConstruct.create("label", {innerHTML: eventLayer.name, style: {display: "block"}}, this[parent]);
                    var check = new CheckBox({
                        value: eventLayer.id,
                        checked: false
                    });
                    domConstruct.place(check.domNode, label, "first");
                    return check;
                }, this);
            },



        /*
         * Gets the routes and measures from the inputs
         */
        _getRoutesAndMeasures: function() {
            var defd = new Deferred();

            var defds = [
                this._fromMeasureInput.getMeasure(),
                this._toMeasureInput.getMeasure(),
                this._fromRouteInput.getRouteValues()
            ];
            if (this._networkLayer && this._networkLayer.supportsLines) {
                defds.push(this._toRouteInput.getRouteValues());
            }

            new DeferredList(defds).then(lang.hitch(this, function(responses) {
                var fromMeasureValues = responses[0][1];
                var toMeasureValues = responses[1][1];
                var fromRouteValues = responses[2][1];
                var toRouteValues = responses.length > 3 ? responses[3][1] : null;
                defd.resolve({fromMeasureValues: fromMeasureValues, toMeasureValues: toMeasureValues, fromRouteValues: fromRouteValues, toRouteValues: toRouteValues});
            }));

            return defd;
        },

        /*
         * Makes sure the routes are valid and if lines are supported that the from and to route are on the same line
         */
        _areRoutesValid: function(fromRouteValues, toRouteValues) {
            var fromInvalid = fromRouteValues == null || fromRouteValues.routeId == null || fromRouteValues.routeId == undefined;
            if (fromInvalid) {
                if (this._networkLayer.supportsLines) {
                    this.showMessage(this.nls.enterFromRoute);
                    this.hideBusy();
                } else {
                    this.showMessage(this.nls.enterRoute);
                    this.hideBusy();
                }
                return false;
            }

            if (this._networkLayer.supportsLines) {
                var toInvalid = !this._toRouteInput.get("isValidRoute");
                if (toInvalid) {
                    this.showMessage(this.nls.invalidToRoute);
                    return false;
                }
            }

            return true;
        },

        /*
         * Make sure the measures are valid numbers
         */
        _areMeasuresValid: function(fromMeasureValues, toMeasureValues) {
            var fromInvalid = (utils.isValidNumber(fromMeasureValues.measure) && !fromMeasureValues.valid);
            var toInvalid = (utils.isValidNumber(toMeasureValues.measure) && !toMeasureValues.valid);
            if (fromInvalid && toInvalid) {
                this.showMessage(this.nls.invalidFromAndToMeasures);
                return false;
            } else if (fromInvalid) {
                this.showMessage(this.nls.invalidFromMeasure);
                return false;
            } else if (toInvalid) {
                this.showMessage(this.nls.invalidToMeasure);
                return false;
            }
            return true;
        },

        /*
         * Makes sure if to inputs are provided that from inputs were also provided
         */
        _areToInputsValid: function(toRouteValues, toMeasureValues, fromMeasureValues) {
            var message = null;
            if (toRouteValues) {
                var toMeasureProvided = utils.isValidNumber(toMeasureValues.measure);
                var fromMeasureProvided = utils.isValidNumber(fromMeasureValues.measure);
                var toRouteProvided = toRouteValues.routeId != null;
                if (toMeasureProvided && !toRouteProvided) {
                    message = this.nls.invalidToLocation;
                } else if (toMeasureProvided && toRouteProvided && !fromMeasureProvided) {
                    message = this.nls.invalidLineFromAndToMeasure;
                } else if (fromMeasureProvided && toRouteProvided && !toMeasureProvided) {
                    message = this.nls.invalidToLocation;
                }
            }
            if (message) {
                this.showMessage(message);
                return false;
            }
            return true;
        },

        /*
         * Gets a partial route geometry based on measures
         */
        _getPartialRoute: function(routeId, toRouteId, fromMeasure, toMeasure) {
            var defd = new Deferred();
            var map = this._mapManager.map;
            var networkLayer = this._networkLayer;
            var location = {
                routeId: routeId,
                fromMeasure: fromMeasure,
                toMeasure: toMeasure
            };
            if (toRouteId) {
                location.toRouteId = toRouteId;
            }
            var params = {
                locations: [location],
                outSR: map.spatialReference.toJson()
            };

            this._mapManager.lrsServiceTask.measureToGeometry(networkLayer.id, params).then(lang.hitch(this, function(response) {
                var foundLocation = null;
                if (response && response.locations && response.locations.length > 0) {
                    foundLocation = utils.first(response.locations, function(loc) {
                        return loc.status === "esriLocatingOK";
                    }, this);
                }
                if (foundLocation) {
                    defd.resolve(geometryUtils.create(foundLocation));
                } else {
                    defd.reject("No full matches found");
                }
            }), lang.hitch(this, function(err) {
                defd.reject(err);
            }));
            return defd;
        },

        _selectAllEvents: function() {
            array.forEach(this._eventLayerCheckboxes, function(eventCheck) {
                eventCheck.set("checked", true);
            }, this);
        },

        _clearAllEvents: function() {
            array.forEach(this._eventLayerCheckboxes, function(eventCheck) {
                eventCheck.set("checked", false);
            }, this);
        },

        /*
         * Generate report (csv) of selected events
         */
        _runReport: function() {
          var that = this;
          var eventMasterList = [];
          var routeId = null;
          var routeName = null;
          var maxAttributeCount = 0;

          var eventLayers = this._getSelectedEventLayers();
          if (eventLayers == null || eventLayers.length < 1) {
            this.showMessage(this.nls.noEventsSelected);
            return;
          }
          var layersProcessed = 0;
          var layersTotal = eventLayers.length;

          this.showBusy();
          this._getRoutesAndMeasures()
          .then(lang.hitch(this, function(routesAndMeasures) {
                var fromRouteValues = routesAndMeasures.fromRouteValues;
                var toRouteValues = routesAndMeasures.toRouteValues;
                var fromMeasureValues = routesAndMeasures.fromMeasureValues;
                var toMeasureValues = routesAndMeasures.toMeasureValues;
                if (
                  this._areRoutesValid(fromRouteValues, toRouteValues) &&
                  this._areMeasuresValid(fromMeasureValues, toMeasureValues) &&
                  this._areToInputsValid(toRouteValues, toMeasureValues, fromMeasureValues)
                )
                {
                  routeId = fromRouteValues.routeId;
                  routeName = fromRouteValues.routeName;
					        var fromMeasure = fromMeasureValues.measure;
                  var toMeasure = toMeasureValues.measure;

                  //Declare the function that runs the query for an event layer
                  function getQuery(eventLayer, json) {
                    var eventName = eventLayer.name;
                    var eventType = eventLayer.type;

                    // Get Event Layer's Unique Attributes
                    var eventLayerAttributeFields = [];
                    if (eventType === "esriLRSIntersectionLayer") {
                      eventLayerAttributeFields = json.IntersectionLayers.filter(function(val) {
                        return val.Name === eventName;
                      })[0].Attributes;
                    }
                    else {
                      eventLayerAttributeFields = json.EventLayers.filter(function(val) {
                        return val.Name === eventName;
                      })[0].Attributes;
                    }

                    // Track Max Attribute Count
                    var attributeCount = eventLayerAttributeFields.length;
                    if (attributeCount > maxAttributeCount) {
                      maxAttributeCount = attributeCount;
                    }

                    //Set Up Query
                    var queryService = that._mapManager.lrsMapLayerConfig.url + '/' + eventLayer.id;
                    var queryTask = new QueryTask(queryService);
                    var query = new Query();
                    query.returnGeometry = false;
                    query.where = that._getWhereParameter(routeId, fromMeasure, toMeasure, eventType);
                    query.outFields = ["*"];

                    var defd = new Deferred();

                    queryTask.execute(query).then(lang.hitch(this, function(response) {
                      defd.resolve({eventLayer: eventLayer, result: response, attributes: eventLayerAttributeFields});
                    }));

                    return defd;
                  } //End function declaration

                  //Declare the function tha processes the data returned from the query
                  function processResult(featureSet, eventLayer, eventLayerAttributeFields) {
                    // apply domains
                    that._applyDomains(featureSet, eventLayer);
                    // get field aliases
                    var eventLayerAttributeFieldAliases = [];
                      array.forEach(eventLayerAttributeFields, function(f1) {
                        var field = eventLayer.fields.filter(function(f2){
                          return f2.name == f1;
                        })[0];
                        eventLayerAttributeFieldAliases.push(field.alias);
                      }, this);

                    if (eventLayer.type === "esriLRSPointEventLayer" || eventLayer.type === "esriLRSIntersectionLayer") {
                      array.forEach(featureSet.features, function(feature) {
                        //Start and End measures
                        var eventMeasure = feature.attributes.MPT;
                        var eventAttributeValues = that._getEventAttributes(eventLayerAttributeFields, feature);

                          // Generate json objects from attribute table fields
                          var eventJson = {
                            "Route ID": routeId,
                            "Route Name": routeName,
                            "Measure": eventMeasure,
                            "Feature": eventLayer.name,
                            "LocationSort": 2,
                            "Location": "Point"
                          };

                          //Add Attributes Unique to this Event Layer
                          var attributeIndex = 0;
                          array.forEach(eventAttributeValues, function(attribute){

                            var attributeString = "no value found";
                            if (attribute != null) {
                              attributeString  = eventAttributeValues[attributeIndex].toString();
                            }

                            var fieldNameObject = {};
                            eventJson["Attribute" + (attributeIndex + 1).toString()] = eventLayerAttributeFieldAliases[attributeIndex].toString() + ': ' + attributeString;
                            attributeIndex++;
                          }, that);

                          eventMasterList.push(eventJson);
                      }, that); //End Feature forEach
                    }

                    if (eventLayer.type === "esriLRSLinearEventLayer") {
                        array.forEach(featureSet.features, function(feature) {
                          //Start and End measures
                          var eventStart = fromMeasure != null && feature.attributes.From_MPT < fromMeasure ? fromMeasure: feature.attributes.From_MPT;
                          var eventEnd = toMeasure != null && feature.attributes.To_MPT > toMeasure ? toMeasure : feature.attributes.To_MPT;
                          var eventAttributes = that._getEventAttributes(eventLayerAttributeFields, feature);

                            // Generate JSON objects from attribute table fields
                            var eventStartJson = {
                              "Route ID": routeId,
                              "Route Name": routeName,
                              "Measure": eventStart,
                              "Feature": eventLayer.name,
                              "LocationSort": 3,
                              "Location": "Begin"
                            };

                            var eventEndJson = {
                              "Route ID": routeId,
                              "Route Name": routeName,
                              "Measure": eventEnd,
                              "Feature": eventLayer.name,
                              "LocationSort": 1,
                              "Location": "End"
                            };

                            //Add Attributes Unique to this Event Layer
                            var attributeIndex = 0;
                            array.forEach(eventAttributes, function(attribute){
                              var fieldNameObject = {};

                              var attributeString = "";
                              if (attribute != null) {
                                attributeString  = eventAttributes[attributeIndex].toString();
                              }

                              eventStartJson["Attribute" + (attributeIndex + 1).toString()] = eventLayerAttributeFieldAliases[attributeIndex].toString() + ': ' + attributeString;
                              eventEndJson["Attribute" + (attributeIndex + 1).toString()] = eventLayerAttributeFieldAliases[attributeIndex].toString() + ': ' + attributeString;
                              attributeIndex++;
                            }, that);

                            eventMasterList.push(eventStartJson);
                            eventMasterList.push(eventEndJson);
                          }, that); //End Feature forEach
                        }
                } //End function declaration

                this._getAttributeConfig()
                .then(lang.hitch(this, function(json){
                  var queryPromises = [];
                  array.forEach(eventLayers, function(eventLayer) {
                    //Run Query and Return Promise
                    queryPromises.push(getQuery(eventLayer, json));
                  }, that);

                  //When all promises are returned...
                  all(queryPromises)
                  .then(function(response){
                    //process each result individually
                    var processingPromises = [];
                    array.forEach(response, function(result) {
                      processingPromises.push(processResult(result.result, result.eventLayer, result.attributes));
                    }, that);

                    //When all processes are complete
                    all(processingPromises)
                    .then(function() {
                      //Download the data
                      that._downloadFile(routeId, eventMasterList, maxAttributeCount);
                      that.hideBusy();
                    })
                  })
              }));
            } //End If Valid
          }));
        },

        /*
         * Sort JSON and download as CSV
         */
        _downloadFile: function(routeId, eventMasterList, maxAttributeCount){
          //Sort by measure and then location type
          eventMasterList.sort(function(a, b) {
            if (a.Measure === b.Measure) {
              return a.LocationSort - b.LocationSort;
            }
            return a.Measure - b.Measure;
          });

          //Setup CSV columns with LocationSort removed
          var csvColumns = ['Route ID','Route Name','Measure','Feature','Location'];
          var attributeNumber = 1;
          while (attributeNumber <= maxAttributeCount) {
            csvColumns.push("Attribute" + attributeNumber.toString());
            attributeNumber++;
          }
          CSVUtils.exportCSV("RoadLog_" + routeId.toString(), eventMasterList, csvColumns);
          },

          /*
           * Get Attributes for Events
           */
          _getEventAttributes: function(fieldNames, feature){
            var eventAttributeValues = []

            array.forEach(fieldNames, function(fieldName) {
              var fieldValue = feature.attributes[fieldName];
              eventAttributeValues.push(fieldValue);
              }, this);
            return eventAttributeValues;
          },

          /*
           * Get attribute config file for event layers
           */
          _getAttributeConfig: function() {
            return dojo.xhrGet({
                url: "./widgets/RoadLog/log_attributes_config.json",
                handleAs: "json",
                sync: false,
                load: function(obj) {
                },
                error: function(err) {
                }
            });
          },

          /*
      		 * Get Where Parameter
      		 */
      		_getWhereParameter: function(routeId, fromMeasure, toMeasure, eventType) {
            var whereParam = "Route_ID = '" + routeId.toString() + "'";

            if (eventType === "esriLRSLinearEventLayer") {
              if (fromMeasure !== null) {
                whereParam = whereParam + ' AND To_MPT >= ' + fromMeasure.toString();
              }
              if (toMeasure !== null) {
                whereParam = whereParam + ' AND From_MPT <= ' + toMeasure.toString();
              }
            }
            else {
              if (fromMeasure !== null) {
                whereParam = whereParam + ' AND MPT >= ' + fromMeasure.toString();
              }
              if (toMeasure !== null) {
                whereParam = whereParam + ' AND MPT <= ' + toMeasure.toString();
              }
            }
            return whereParam;
      		},

          /*
  		 * Get Selected Event Layers
  		 */
        _getSelectedEventLayers: function() {
            var layers = [];
            array.forEach(this._eventLayerCheckboxes, function(eventCheck) {
                if (eventCheck.get("checked")) {
                    var layer = null;

                    //Event Layers
                    array.some(this._mapManager.lrsServiceConfig.eventLayers, function(eventLayer) {
                        if (eventLayer.id == eventCheck.value) {
                            layer = eventLayer;
                            return true;
                        }
                        else {

                        }
                        return false;
                    }, this);

                    //Intersections
                    array.some(this._mapManager.lrsServiceConfig.intersectionLayers, function(eventLayer) {
                        if (eventLayer.id == eventCheck.value) {
                            layer = eventLayer;
                            return true;
                        }
                        return false;
                    }, this);

                    if (layer) {
                        layers.push(layer);
                    }
                }
            }, this);
            return layers;
        },

        /*
         * Apply domain and subtype values
         */
        _applyDomains: function(featureSet, eventLayer) {
            array.forEach(featureSet.features, function(feature) {
                for (fieldName in feature.attributes) {
                  var field = eventLayer.fields.filter(function(f){
                    return f.name == fieldName;
                  })[0];
                        var codedValues = domainUtils.getCodedValues(field, eventLayer, feature.attributes);
                        if (codedValues) {
                            var code = feature.attributes[fieldName];
                            var name = domainUtils.findName(codedValues, code);
                            if (name != null && name != code) {
                                feature.attributes[fieldName] = string.substitute(this.nls.domainCodeValue, [name]);
                            }
                        }
                    }
            }, this);
        },

        onClose: function() {
            this._fromMeasureInput.setMeasure(null, null, false);
            this._toMeasureInput.setMeasure(null, null, false);
            this._toRouteInput.setRouteValues({}, false);
            this._fromRouteInput.setRouteValues({}, false);
            this._fromMeasureInput.deactivate();
            this._toMeasureInput.deactivate();
            this._toRouteInput.deactivate();
            this._fromRouteInput.deactivate();
        }

    });
});

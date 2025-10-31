// compute edge area over amazon forests
// dhemerson.costa@ipam.org.br

// set years to be used
var years = [
  1985, 1986, 1987, 1988, 1989, 1990, 1991, 1992, 1993, 1994, 1995, 1996, 1997,
  1998, 1999, 2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 
  2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 
  2024
  ];

// define edge to be used
var edge_length = 120;

// read edge area
var edge = ee.ImageCollection('projects/mapbiomas-brazil/assets/DEGRADATION/COLLECTION-10/edge-area')
  .map(function(image) {
    return image.lte(edge_length).selfMask();
  })
  .toBands();
  print(edge)

// load land use and land cover
var collection = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10/mapbiomas_brazil_collection10_integration_v2');
collection = collection.eq(3).or(collection.eq(6)).selfMask();

// get only forest edges
var recipe = ee.Image([]);
years.forEach(function(year_i) {
  
  // get edge for the year i
  var edge_i = edge.select('EDGE-AREA-' + year_i + '-1_edge_' + year_i);
  
  // get forest for the year i
  var forest_i = collection.select('classification_' + year_i);
  
  // select only forest edges
  var forest_edge_i = ee.Image(0).where(edge_i.eq(1).and(forest_i.eq(1)), 1)
    .selfMask()
    .rename('classification_' + year_i);
  
  recipe = recipe.addBands(forest_edge_i);
  
});

//Map.addLayer(recipe, {}, 'recipe')
//Map.addLayer(collection.select(39), {}, 'forest')
//Map.addLayer(edge.select(39), {palette:['red', 'yellow', 'green'], min:1, max: 120}, 'edge')

// carregar eco regioes
var territory = ee.FeatureCollection('users/dh-conciani/help/gatti-inpe/grade_rec')
territory = ee.Image().paint(territory, 'id').rename('territory');

Map.addLayer(territory.randomVisualizer(), {}, 'territory');

// change the scale if you need.
var scale = 30;

// define a Google Drive output folder 
var driverFolder = 'co2paper_2025';

// get the classification for the file[i] 
var asset_i = recipe.selfMask();

// Image area in hectares
var pixelArea = ee.Image.pixelArea().divide(10000);

// Geometry to export
var geometry = asset_i.geometry();

// convert a complex object to a simple feature collection 
var convert2table = function (obj) {
  obj = ee.Dictionary(obj);
    var territory = obj.get('territory');
    var classesAndAreas = ee.List(obj.get('groups'));
    
    var tableRows = classesAndAreas.map(
        function (classAndArea) {
            classAndArea = ee.Dictionary(classAndArea);
            var classId = classAndArea.get('class');
            var area = classAndArea.get('sum');
            var tableColumns = ee.Feature(null)
                .set('territory', territory)
                .set('class_id', classId)
                .set('area', area);
                
            return tableColumns;
        }
    );
  
    return ee.FeatureCollection(ee.List(tableRows));
};

// compute the area
var calculateArea = function (image, territory, geometry) {
    var territotiesData = pixelArea.addBands(territory).addBands(image)
        .reduceRegion({
            reducer: ee.Reducer.sum().group(1, 'class').group(1, 'territory'),
            geometry: geometry,
            scale: scale,
            maxPixels: 1e13
        });
        
    territotiesData = ee.List(territotiesData.get('groups'));
    var areas = territotiesData.map(convert2table);
    areas = ee.FeatureCollection(areas).flatten();
    return areas;
};

// perform per year 
var areas = years.map(
    function (year) {
        var image = asset_i.select('classification_' + year);
        var areas = calculateArea(image, territory, geometry);
        // set additional properties
        areas = areas.map(
            function (feature) {
                return feature.set('year', year);
            }
        );
        return areas;
    }
);

areas = ee.FeatureCollection(areas).flatten();
  
Export.table.toDrive({
    collection: areas,
    description: 'degrad_co2paper_v6',
    folder: driverFolder,
    fileFormat: 'CSV'
});

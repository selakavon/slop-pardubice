// Tier-2 building specs, keyed by OSM id (format: docs/superpowers/plans/2026-11-05-slop-pardubice-stage3.md,
// "Tier-2 spec format"). Each spec is written from the Commons photo it names; CREDITS.md credits the photo.
export const BUILDING_SPECS = {
  // --- náměstí Republiky ---------------------------------------------------------------------------------------------
  // Grandhotel (Josef Gočár, 1928–31): cream functionalist block, shops along the ground floor, flat roof under a thin
  // slab (js/pardubice-landmark-models.js adds the slab and the GRAND banners)
  'way/45856020': { area: 'republiky', label: 'Grand', style: 'functionalist', render: '#ebe3cf', storeys: 5,
    roof: 'flat', ground: 'shops', photo: 'File:Pardubice, Grand.jpg' },
  // Městské divadlo (Antonín Balšánek, 1909): cream secession wings; the portal and the stage house are hand-made
  'way/45847403': { area: 'republiky', label: 'Východočeské divadlo', style: 'secession', render: '#ece2c4', storeys: 3,
    roof: 'hipped', roofColour: '#7a4a32', cornice: 'rich', ground: 'plain', ornament: 3,
    photo: 'File:Pardubice - Náměstí Republiky - View SSE on Městské Divadlo - Secession.jpg' },
  // Anglobanka (čp. 222, by the gate): grey-beige stone bank with giant pilasters and a low copper hipped roof
  'way/46041720': { area: 'republiky', label: 'Anglobanka (čp. 222)', style: 'historicist', render: '#c9c3b3', storeys: 3,
    roof: 'hipped', roofColour: '#5b7f6a', cornice: 'rich', ornament: 3, photo: 'File:Anglobanka, nam. Republiky 222, Pardubice (01).JPG' },
  // Městská spořitelna (čp. 1, 1917): cream secession corner block under a grey mansard with dormers, shops below
  'way/45849177': { area: 'republiky', label: 'Městská spořitelna (čp. 1)', style: 'secession', render: '#e8dcbf', storeys: 3,
    roof: 'mansard', roofColour: '#5f6466', cornice: 'rich', ground: 'shops', ornament: 2,
    photo: 'File:Mestska sporitelna, nam. Republiky 1, Pardubice (01).JPG' },
  // Ředitelství pošt a telegrafů (čp. 12): long cream block with an ochre-brick middle, dark hipped roof
  'way/45849107': { area: 'republiky', label: 'Ředitelství pošt a telegrafů (čp. 12)', style: 'historicist', render: '#d9b77e',
    storeys: 4, roof: 'hipped', roofColour: '#5a6b5f', cornice: 'simple', ornament: 2,
    photo: 'File:Republiky square, east part, Pardubice.jpg' },
  // Průmyslové muzeum (čp. 116): interwar block with vertical fins, beige-grey render, flat roof
  'relation/18696063': { area: 'republiky', label: 'Průmyslové muzeum (čp. 116)', style: 'modern', render: '#c2b9a6', storeys: 4,
    roof: 'flat', photo: 'File:Průmyslové muzeum, nám. Republiky (býv. Osvobození) 116, Pardubice.JPG' },
  // čp. 115, between the museum and the Grand: a low cream house under a red tiled hipped roof
  'way/45856019': { area: 'republiky', label: 'čp. 115', style: 'classicist', render: '#e3d3b0', storeys: 2, roof: 'hipped',
    roofColour: '#a14b33', photo: 'File:Republiky square, middle part, Pardubice.jpg' },
  // Palác Hybský (čp. 56) on the třída Míru corner: blue-grey glazed tiles, punched windows, shops, flat roof
  'way/46041301': { area: 'republiky', label: 'palác Hybský (čp. 56)', style: 'functionalist', render: '#5d6b78', storeys: 5,
    roof: 'flat', ground: 'shops', photo: 'File:Hotel Grand Pardubice (01).JPG' },
  // čp. 55: the low wing between palác Hybský and Dům techniky
  'way/46041302': { area: 'republiky', label: 'čp. 55', style: 'historicist', render: '#d8c49c', storeys: 2, roof: 'hipped',
    roofColour: '#8e4a35', ground: 'shops', ornament: 2, photo: 'File:Pardubice, náměstí Republiky, zastávka a divadlo.jpg' },
  // Dům techniky (čp. 2686): ochre brick façade with stone trims under a red tiled hipped roof
  'way/46041288': { area: 'republiky', label: 'Dům techniky (čp. 2686)', style: 'historicist', render: '#c08a5a', storeys: 5,
    roof: 'hipped', roofColour: '#8e4a35', cornice: 'rich', ornament: 2,
    photo: 'File:Pardubice, náměstí Republiky, od třídy Míru k divadlu.jpg' },
  // The row west of the theatre: ochre and sand 19th-century houses with red tiled roofs and balconies
  'way/267493813': { area: 'republiky', label: 'čp. 53', style: 'historicist', render: '#d6a55f', storeys: 4, roof: 'skirt',
    roofColour: '#a2513a', cornice: 'rich', ground: 'shops', photo: 'File:Pardubice, náměstí Republiky, jízdní pruhy a divadlo.jpg' },
  'way/46041291': { area: 'republiky', label: 'čp. 52', style: 'historicist', render: '#e0b878', storeys: 3, roof: 'gabled',
    roofColour: '#a2513a', cornice: 'simple', ground: 'shops', photo: 'File:Pardubice, náměstí Republiky, jízdní pruhy a divadlo.jpg' },
  'way/46041292': { area: 'republiky', label: 'čp. 137', style: 'historicist', render: '#cf9a5a', storeys: 3, roof: 'gabled',
    roofColour: '#9a4a32', cornice: 'simple', photo: 'File:Pardubice, náměstí Republiky, jízdní pruhy a divadlo.jpg' },
  'way/46041289': { area: 'republiky', label: 'čp. 828', style: 'historicist', render: '#d8c49a', storeys: 4, roof: 'skirt',
    roofColour: '#8e4a35', cornice: 'rich', photo: 'File:Pardubice, náměstí Republiky, jízdní pruhy a divadlo.jpg' },
  'way/1418268524': { area: 'republiky', label: 'courtyard house behind čp. 828', style: 'classicist', render: '#e2cfa6',
    storeys: 2, roof: 'gabled', roofColour: '#9a4a32', ornament: 1, photo: 'File:Pardubice, náměstí Republiky, jízdní pruhy a divadlo.jpg' },
  // čp. 49, south of the theatre on U Divadla: sand-coloured block
  'way/45848799': { area: 'republiky', label: 'čp. 49', style: 'historicist', render: '#d9c08e', storeys: 4, roof: 'skirt',
    roofColour: '#8e4a35', cornice: 'simple', photo: 'File:Pardubice, divadlo, od magistrátu.jpg' },
  // The low commercial pavilion east of the theatre
  'way/1355513256': { area: 'republiky', label: 'pavilion by the theatre', style: 'modern', render: '#bdb8ad', storeys: 2,
    roof: 'flat', ground: 'shops', photo: 'File:Pardubice, náměstí Republiky, zastávka a divadlo.jpg' },
  // --- Landmarks drawn by the generator ------------------------------------------------------------------------------
  // Pardubice Castle (Renaissance, Vilém z Pernštejna): white render with sgraffito, dark slate roofs, attic gables;
  // js/pardubice-landmark-models.js adds the gate passage, the two towers and the ramparts
  'relation/104530': { area: 'landmark', label: 'zámek Pardubice', style: 'renaissance', render: '#efebe2', storeys: 3,
    roof: 'skirt', roofColour: '#4a4e54', cornice: 'simple', gable: 'attic', ornament: 3,
    photo: 'File:Pardubice Castle 01 (js).jpg' }
};

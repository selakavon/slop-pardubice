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
    photo: 'File:Pardubice - Náměstí Republiky - View SSE on Městské Divadlo - Secession.jpg' }
};

[out:json][timeout:240][bbox:50.0290,15.7500,50.0460,15.7850];
(
  way[building]; relation[building];
  way["building:part"]; relation["building:part"];
  way[highway];
  node[highway~"^(traffic_signals|crossing|stop|give_way)$"];
  way[natural=water]; relation[natural=water];
  way[waterway~"^(river|riverbank|canal|stream)$"]; relation[waterway~"^(river|riverbank)$"];
  way[water]; relation[water];
  way[leisure~"^(park|garden|playground)$"]; relation[leisure~"^(park|garden|playground)$"];
  way[landuse~"^(grass|forest|recreation_ground)$"]; relation[landuse~"^(grass|forest|recreation_ground)$"];
  node[natural=tree];
  relation[route=trolleybus];
  way[railway];
  way[trolley_wire];
  nwr[historic=castle];
  nwr[name~"^(Zelená brána|Grand|Východočeské divadlo|Pardubice hlavní nádraží|Tyršovy sady|Karlovina|kostel sv\\. Bartoloměje)$"];
);
out geom;

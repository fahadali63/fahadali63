// Static reference data used by the generator. Values are planning-level
// defaults drawn from the model codes (IBC / IPC / NEC / ASHRAE) and are
// meant to be reviewed by the licensed professional of record.

export const PHASES = [
  { id: 'programming', name: 'Programming' },
  { id: 'schematic', name: 'Schematic design' },
  { id: 'dd', name: 'Design development' },
  { id: 'cd', name: 'Construction documentation' },
  { id: 'cost', name: 'Cost estimation' },
];

export const DISCIPLINES = [
  { id: 'general', name: 'General', prefix: 'G' },
  { id: 'architectural', name: 'Architectural', prefix: 'A' },
  { id: 'structural', name: 'Structural', prefix: 'S' },
  { id: 'mechanical', name: 'Mechanical', prefix: 'M' },
  { id: 'electrical', name: 'Electrical', prefix: 'E' },
  { id: 'plumbing', name: 'Plumbing', prefix: 'P' },
  { id: 'title24', name: 'Title 24 energy compliance', prefix: 'T24' },
  { id: 'fire', name: 'Fire and life safety', prefix: 'FLS' },
  { id: 'interior', name: 'Interior', prefix: 'I' },
  { id: 'civil', name: 'Civil', prefix: 'C', enterprise: true },
  { id: 'landscape', name: 'Landscape', prefix: 'L', enterprise: true },
];

// Which disciplines are produced at each phase.
export const PHASE_DISCIPLINES = {
  programming: ['general'],
  schematic: ['general', 'architectural'],
  dd: ['general', 'architectural', 'structural', 'mechanical', 'electrical', 'plumbing', 'interior'],
  cd: DISCIPLINES.map((d) => d.id),
  cost: DISCIPLINES.map((d) => d.id),
};

// Occupancy data. lf = occupant load factor (sf per person, IBC Table 1004.5),
// travel = max exit access travel distance ft [unsprinklered, sprinklered] (IBC Table 1017.2),
// sfTon = cooling sf per ton, oa = [cfm/person, cfm/sf] ventilation, lpd = W/sf lighting design target,
// recVA = general receptacle VA/sf, cost = construction $/sf (national mid-range baseline).
export const OCCUPANCIES = {
  B:   { name: 'B - Business (office)',            lf: 150, travel: [200, 300], sfTon: 350, oa: [5, 0.06],  lpd: 0.60, recVA: 3.0, cost: 285, dwelling: false },
  'A-2': { name: 'A-2 - Restaurant / assembly',    lf: 15,  travel: [200, 250], sfTon: 150, oa: [7.5, 0.18], lpd: 0.90, recVA: 3.0, cost: 395, dwelling: false },
  'A-3': { name: 'A-3 - Assembly',                 lf: 15,  travel: [200, 250], sfTon: 150, oa: [5, 0.06],  lpd: 0.80, recVA: 2.0, cost: 360, dwelling: false },
  E:   { name: 'E - Educational',                  lf: 20,  travel: [200, 250], sfTon: 250, oa: [10, 0.12], lpd: 0.70, recVA: 3.0, cost: 365, dwelling: false },
  M:   { name: 'M - Mercantile (retail)',          lf: 60,  travel: [200, 250], sfTon: 250, oa: [7.5, 0.12], lpd: 1.00, recVA: 3.0, cost: 240, dwelling: false },
  'R-2': { name: 'R-2 - Multifamily residential',  lf: 200, travel: [200, 250], sfTon: 500, oa: [5, 0.06],  lpd: 0.50, recVA: 3.0, cost: 300, dwelling: true },
  'R-3': { name: 'R-3 - Single-family residential', lf: 200, travel: [200, 250], sfTon: 500, oa: [5, 0.06],  lpd: 0.50, recVA: 3.0, cost: 255, dwelling: true },
  'S-1': { name: 'S-1 - Storage (moderate hazard)', lf: 300, travel: [200, 250], sfTon: 800, oa: [0, 0.06],  lpd: 0.40, recVA: 1.0, cost: 150, dwelling: false },
  'F-1': { name: 'F-1 - Factory (moderate hazard)', lf: 100, travel: [200, 250], sfTon: 600, oa: [10, 0.18], lpd: 0.70, recVA: 2.0, cost: 195, dwelling: false },
};

export const CONSTRUCTION_TYPES = {
  IA:   { name: 'Type IA',   frameHr: 3, system: 'steel',    desc: 'Noncombustible, protected (3-hr frame)' },
  IB:   { name: 'Type IB',   frameHr: 2, system: 'steel',    desc: 'Noncombustible, protected (2-hr frame)' },
  IIA:  { name: 'Type IIA',  frameHr: 1, system: 'steel',    desc: 'Noncombustible, protected (1-hr frame)' },
  IIB:  { name: 'Type IIB',  frameHr: 0, system: 'steel',    desc: 'Noncombustible, unprotected' },
  IIIA: { name: 'Type IIIA', frameHr: 1, system: 'masonry',  desc: 'Noncombustible exterior walls, protected combustible interior' },
  IIIB: { name: 'Type IIIB', frameHr: 0, system: 'masonry',  desc: 'Noncombustible exterior walls, unprotected combustible interior' },
  VA:   { name: 'Type VA',   frameHr: 1, system: 'wood',     desc: 'Combustible, protected (1-hr frame)' },
  VB:   { name: 'Type VB',   frameHr: 0, system: 'wood',     desc: 'Combustible, unprotected' },
};

// Room types: category drives finishes, lighting, plumbing and egress.
// area = default area (sf); core = repeated vertically and placed first.
export const ROOM_TYPES = {
  lobby:      { label: 'Lobby',            area: 300, floor: 'Porcelain tile',     base: 'Tile',  wall: 'Paint',     ceil: 'ACT / GWB',  color: '#e8dcc8', lf: 100 },
  office:     { label: 'Private office',   area: 140, floor: 'Carpet tile',        base: 'Rubber',wall: 'Paint',     ceil: 'ACT',        color: '#dbe7d6', lf: 150 },
  open_office:{ label: 'Open office',      area: 1200,floor: 'Carpet tile',        base: 'Rubber',wall: 'Paint',     ceil: 'ACT',        color: '#d4e4ef', lf: 150 },
  conference: { label: 'Conference',       area: 300, floor: 'Carpet tile',        base: 'Rubber',wall: 'Paint',     ceil: 'ACT',        color: '#efe0c8', lf: 15 },
  classroom:  { label: 'Classroom',        area: 900, floor: 'VCT',                base: 'Rubber',wall: 'Paint',     ceil: 'ACT',        color: '#e3dcef', lf: 20 },
  assembly:   { label: 'Assembly',         area: 1500,floor: 'Sealed concrete',    base: 'Rubber',wall: 'Paint',     ceil: 'GWB',        color: '#efd9d9', lf: 15 },
  dining:     { label: 'Dining',           area: 1200,floor: 'Sealed concrete',    base: 'Wood',  wall: 'Paint',     ceil: 'GWB',        color: '#f1dfc5', lf: 15 },
  kitchen:    { label: 'Kitchen',          area: 250, floor: 'Quarry tile',        base: 'Quarry',wall: 'FRP',       ceil: 'GWB (moisture resistant)', color: '#ede6c4', lf: 200 },
  retail:     { label: 'Sales floor',      area: 2000,floor: 'Polished concrete',  base: 'Rubber',wall: 'Paint',     ceil: 'Exposed / paint', color: '#e6d6e8', lf: 60 },
  storage:    { label: 'Storage',          area: 250, floor: 'Sealed concrete',    base: 'None',  wall: 'Paint',     ceil: 'Exposed',    color: '#dcdcdc', lf: 300 },
  restroom:   { label: 'Restroom',         area: 120, floor: 'Ceramic tile',       base: 'Tile',  wall: 'Tile / paint', ceil: 'GWB (moisture resistant)', color: '#cfe6ea', lf: 0, core: true },
  stair:      { label: 'Stair',            area: 180, floor: 'Concrete',           base: 'None',  wall: 'Paint',     ceil: 'GWB',        color: '#f0d4c4', lf: 0, core: true },
  elevator:   { label: 'Elevator',         area: 64,  floor: 'Cab finish',         base: 'None',  wall: 'N/A',       ceil: 'N/A',        color: '#e0e0e8', lf: 0, core: true },
  mechanical: { label: 'Mechanical room',  area: 120, floor: 'Sealed concrete',    base: 'None',  wall: 'Paint',     ceil: 'Exposed',    color: '#d6d6d6', lf: 300, core: true },
  electrical: { label: 'Electrical room',  area: 100, floor: 'Sealed concrete',    base: 'None',  wall: 'Paint',     ceil: 'Exposed',    color: '#e9e2c1', lf: 300, core: true },
  bedroom:    { label: 'Bedroom',          area: 130, floor: 'Engineered wood',    base: 'Wood',  wall: 'Paint',     ceil: 'GWB',        color: '#e1e8d2', lf: 200 },
  bath:       { label: 'Bathroom',         area: 55,  floor: 'Ceramic tile',       base: 'Tile',  wall: 'Tile / paint', ceil: 'GWB (moisture resistant)', color: '#cfe6ea', lf: 200 },
  living:     { label: 'Living room',      area: 260, floor: 'Engineered wood',    base: 'Wood',  wall: 'Paint',     ceil: 'GWB',        color: '#efe2cf', lf: 200 },
  garage:     { label: 'Garage',           area: 400, floor: 'Sealed concrete',    base: 'None',  wall: 'Type X GWB',ceil: 'Type X GWB', color: '#d9d9d9', lf: 200 },
  lab:        { label: 'Lab / shop',       area: 800, floor: 'Sealed concrete',    base: 'Rubber',wall: 'Paint',     ceil: 'Exposed',    color: '#dde9d9', lf: 100 },
  warehouse:  { label: 'Warehouse',        area: 3000,floor: 'Sealed concrete',    base: 'None',  wall: 'Paint',     ceil: 'Exposed',    color: '#d9d4c7', lf: 500 },
};

export const CORE_ORDER = ['stair', 'elevator', 'restroom', 'mechanical', 'electrical'];

export const JURISDICTIONS = {
  'Los Angeles, CA':  { state: 'CA', codes: '2025 California Building Code (2024 IBC base), CBC Chapter 11B, LA Municipal Code', zone: 9, title24: true },
  'San Francisco, CA':{ state: 'CA', codes: '2025 California Building Code, SF Building Code amendments', zone: 3, title24: true },
  'San Diego, CA':    { state: 'CA', codes: '2025 California Building Code, San Diego Municipal Code', zone: 7, title24: true },
  'Sacramento, CA':   { state: 'CA', codes: '2025 California Building Code', zone: 12, title24: true },
  'Austin, TX':       { state: 'TX', codes: '2021 IBC with City of Austin amendments, 2021 IECC', zone: 0, title24: false },
  'Dallas, TX':       { state: 'TX', codes: '2021 IBC with City of Dallas amendments, 2021 IECC', zone: 0, title24: false },
  'Phoenix, AZ':      { state: 'AZ', codes: '2018 IBC with City of Phoenix amendments', zone: 0, title24: false },
  'Seattle, WA':      { state: 'WA', codes: '2021 Seattle Building Code, WSEC', zone: 0, title24: false },
  'Denver, CO':       { state: 'CO', codes: '2022 Denver Building Code (2021 IBC base)', zone: 0, title24: false },
  'Miami, FL':        { state: 'FL', codes: 'Florida Building Code 8th Edition (2023), HVHZ where applicable', zone: 0, title24: false },
  'New York, NY':     { state: 'NY', codes: '2022 NYC Building Code', zone: 0, title24: false },
  'Chicago, IL':      { state: 'IL', codes: '2019 Chicago Construction Codes', zone: 0, title24: false },
  Other:              { state: '', codes: 'Locally adopted edition of the IBC, IFC and NFPA 13 (confirm with the jurisdiction)', zone: 0, title24: false },
};

export const COST_SPLIT = {
  // share of construction cost by discipline (planning-level)
  architectural: 0.34, structural: 0.14, mechanical: 0.14, electrical: 0.11, plumbing: 0.06,
  fire: 0.04, interior: 0.07, site: 0.10,
};

export const LOCATION_FACTOR = { CA: 1.22, NY: 1.30, WA: 1.08, IL: 1.12, CO: 1.02, TX: 0.92, AZ: 0.95, FL: 0.94, '': 1.0 };

import { useState, useMemo } from 'react';
import {
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import { DISTRICT_BOUNDARIES, FACILITY_COORDINATES, type GisDistrict, type GisFacilityPoint } from '../../shared/gis';

export interface FacilityRecord {
  id?: string;
  external_id?: string;
  name?: string;
  type?: string;
  country?: string;
  [key: string]: unknown;
}

export interface StockRecord {
  facility_id?: string;
  external_id?: string;
  product_name?: string;
  risk?: string;
  days_of_stock?: number | null;
  usable_stock?: number;
  transfer_opportunity?: {
    donor_facility?: string;
    donor_external_id?: string;
    quantity?: number;
    unit?: string;
  } | null;
  [key: string]: unknown;
}

interface GisMapProps {
  facilities?: FacilityRecord[];
  stockRecords?: StockRecord[];
  onSelectFacility?: (facilityExternalId: string) => void;
}

export function GisMap({ facilities = [], stockRecords = [], onSelectFacility }: GisMapProps) {
  const [activeLayers, setActiveLayers] = useState({
    districts: true,
    facilities: true,
    transfers: true,
    heatmap: false,
  });

  const [selectedDistrict, setSelectedDistrict] = useState<GisDistrict | null>(null);
  const [selectedFacility, setSelectedFacility] = useState<GisFacilityPoint | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<string>('all');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Map coordinate bounds: Longitude 31° to 41°, Latitude -1.5° to -10.5°
  const minLng = 31.5;
  const maxLng = 40.5;
  const minLat = -10.0;
  const maxLat = -1.8;

  const mapWidth = 860;
  const mapHeight = 540;

  // Projection helper: Mercator-like normalized mapping to SVG viewport
  const project = (lng: number, lat: number): [number, number] => {
    const x = ((lng - minLng) / (maxLng - minLng)) * mapWidth;
    const y = ((maxLat - lat) / (maxLat - minLat)) * mapHeight;
    return [x, y];
  };

  // Compile facility risk data
  const facilityPoints = useMemo(() => {
    return facilities.map((f) => {
      const extId = f.external_id || f.id || 'FAC-UNKNOWN';
      const coords = FACILITY_COORDINATES[extId] || [36.0, -5.0];
      const records = stockRecords.filter((r) => r.external_id === extId || r.facility_id === f.id);
      const filtered = selectedProduct === 'all' ? records : records.filter((r) => r.product_name === selectedProduct);

      let highestRisk: 'Critical' | 'Elevated' | 'Stable' = 'Stable';
      if (filtered.some((r) => r.risk === 'Critical')) highestRisk = 'Critical';
      else if (filtered.some((r) => r.risk === 'Elevated')) highestRisk = 'Elevated';

      const avgDays = filtered.length
        ? Math.round(filtered.reduce((acc, r) => acc + (r.days_of_stock || 0), 0) / filtered.length)
        : 28;

      const criticalMeds = filtered
        .filter((r) => r.risk === 'Critical' && r.product_name)
        .map((r) => r.product_name as string);

      return {
        id: f.id || extId,
        external_id: extId,
        name: f.name || extId,
        type: f.type || 'Clinic',
        district: 'Regional District',
        region: 'Northern/Central',
        country: f.country || 'Kijani Republic',
        coordinates: coords,
        riskLevel: highestRisk,
        daysOfStock: avgDays,
        criticalMedicines: criticalMeds,
      } as GisFacilityPoint;
    });
  }, [facilities, stockRecords, selectedProduct]);

  // Compile transfer routes between facilities
  const transferRoutes = useMemo(() => {
    const routes: Array<{
      id: string;
      donorId: string;
      donorName: string;
      recipientId: string;
      recipientName: string;
      from: [number, number];
      to: [number, number];
      productName: string;
      quantity: number;
      unit: string;
    }> = [];

    for (const r of stockRecords) {
      if (r.transfer_opportunity) {
        const donorExt = r.transfer_opportunity.donor_external_id || '';
        const recipientExt = r.external_id || '';

        const fromCoord = FACILITY_COORDINATES[donorExt];
        const toCoord = FACILITY_COORDINATES[recipientExt];

        if (fromCoord && toCoord && donorExt && recipientExt) {
          routes.push({
            id: `transfer-${donorExt}-${recipientExt}-${r.product_name || 'med'}`,
            donorId: donorExt,
            donorName: r.transfer_opportunity.donor_facility || donorExt,
            recipientId: recipientExt,
            recipientName: facilities.find((f) => f.external_id === recipientExt)?.name || recipientExt,
            from: fromCoord,
            to: toCoord,
            productName: r.product_name || 'Medical supplies',
            quantity: r.transfer_opportunity.quantity || 0,
            unit: r.transfer_opportunity.unit || 'units',
          });
        }
      }
    }
    return routes;
  }, [stockRecords, facilities]);

  // Compute district aggregated risk
  const districtRiskMap = useMemo(() => {
    const map = new Map<string, { risk: 'Critical' | 'Elevated' | 'Stable'; count: number; facilities: number }>();
    for (const d of DISTRICT_BOUNDARIES) {
      const distFacs = facilityPoints.filter((fp) => d.facilities.includes(fp.external_id));
      let risk: 'Critical' | 'Elevated' | 'Stable' = 'Stable';
      if (distFacs.some((f) => f.riskLevel === 'Critical')) risk = 'Critical';
      else if (distFacs.some((f) => f.riskLevel === 'Elevated')) risk = 'Elevated';
      map.set(d.id, { risk, count: distFacs.length, facilities: d.facilities.length });
    }
    return map;
  }, [facilityPoints]);

  const uniqueProducts = useMemo(() => {
    return Array.from(new Set(stockRecords.map((r) => r.product_name))).filter(Boolean);
  }, [stockRecords]);

  return (
    <div className="gis-map-container bg-white border border-[#e2e7df] rounded-xl overflow-hidden shadow-sm">
      {/* Map Control Bar */}
      <div className="p-4 border-b border-[#e2e7df] flex flex-wrap items-center justify-between gap-3 bg-[#fbfcfb]">
        <div className="flex items-center gap-2">
          <Layers size={18} className="text-[#174b3a]" />
          <div>
            <h3 className="text-sm font-semibold text-[#123c30]">District Health GIS Spatial Intelligence</h3>
            <p className="text-xs text-[#5d6b60]">GeoJSON administrative boundaries &bull; Stockout heat zones &bull; Redistribution corridors</p>
          </div>
        </div>

        {/* Filter and Layer Toggles */}
        <div className="flex flex-wrap items-center gap-2">
          {uniqueProducts.length > 0 && (
            <select
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              className="text-xs bg-white border border-[#dbe2d8] rounded-md px-2.5 py-1.5 text-[#25342e]"
              aria-label="Filter by medicine product"
            >
              <option value="all">All Essential Medicines</option>
              {uniqueProducts.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-1 bg-white border border-[#dbe2d8] rounded-md p-1">
            <button
              onClick={() => setActiveLayers((prev) => ({ ...prev, districts: !prev.districts }))}
              className={`px-2 py-1 text-xs rounded ${activeLayers.districts ? 'bg-[#174b3a] text-white font-medium' : 'text-[#5d6b60]'}`}
            >
              Districts
            </button>
            <button
              onClick={() => setActiveLayers((prev) => ({ ...prev, facilities: !prev.facilities }))}
              className={`px-2 py-1 text-xs rounded ${activeLayers.facilities ? 'bg-[#174b3a] text-white font-medium' : 'text-[#5d6b60]'}`}
            >
              Facilities
            </button>
            <button
              onClick={() => setActiveLayers((prev) => ({ ...prev, transfers: !prev.transfers }))}
              className={`px-2 py-1 text-xs rounded ${activeLayers.transfers ? 'bg-[#174b3a] text-white font-medium' : 'text-[#5d6b60]'}`}
            >
              Transfers
            </button>
          </div>

          {/* Zoom & Pan Controls */}
          <div className="flex items-center gap-1 border border-[#dbe2d8] rounded-md bg-white p-1">
            <button
              onClick={() => setZoom((z) => Math.min(z + 0.25, 2.5))}
              className="p-1 hover:bg-[#f6f7f4] rounded text-[#25342e]"
              title="Zoom in"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(z - 0.25, 0.75))}
              className="p-1 hover:bg-[#f6f7f4] rounded text-[#25342e]"
              title="Zoom out"
            >
              <ZoomOut size={14} />
            </button>
            <button
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="p-1 hover:bg-[#f6f7f4] rounded text-[#25342e]"
              title="Reset view"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Map Canvas Area */}
      <div className="relative w-full overflow-hidden bg-[#eef3ed]" style={{ height: '480px' }}>
        <svg
          viewBox={`0 0 ${mapWidth} ${mapHeight}`}
          className="w-full h-full cursor-grab active:cursor-grabbing select-none"
          style={{
            transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
            transformOrigin: 'center center',
            transition: 'transform 0.15s ease-out',
          }}
        >
          {/* Subtle Geographic Grid Lines */}
          <g stroke="#dbe4da" strokeWidth="1" strokeDasharray="3 3">
            {[33, 35, 37, 39].map((lng) => {
              const [x1] = project(lng, minLat);
              const [x2] = project(lng, maxLat);
              return <line key={`lng-${lng}`} x1={x1} y1={0} x2={x2} y2={mapHeight} />;
            })}
            {[-3, -5, -7, -9].map((lat) => {
              const [, y1] = project(minLng, lat);
              const [, y2] = project(maxLng, lat);
              return <line key={`lat-${lat}`} x1={0} y1={y1} x2={mapWidth} y2={y2} />;
            })}
          </g>

          {/* District Boundaries & Choropleth Layer */}
          {activeLayers.districts && (
            <g className="district-layer">
              {DISTRICT_BOUNDARIES.map((d) => {
                const pointsStr = d.coordinates[0]
                  .map(([lng, lat]) => {
                    const [px, py] = project(lng, lat);
                    return `${px},${py}`;
                  })
                  .join(' ');

                const riskInfo = districtRiskMap.get(d.id);
                const isSelected = selectedDistrict?.id === d.id;

                let fill = '#dbe7dd';
                let stroke = '#89a891';
                if (riskInfo?.risk === 'Critical') {
                  fill = '#fdeae8';
                  stroke = '#d97d74';
                } else if (riskInfo?.risk === 'Elevated') {
                  fill = '#fef5e7';
                  stroke = '#e0aa53';
                }

                const [cx, cy] = project(d.center[0], d.center[1]);

                return (
                  <g key={d.id}>
                    <polygon
                      points={pointsStr}
                      fill={fill}
                      stroke={isSelected ? '#174b3a' : stroke}
                      strokeWidth={isSelected ? '2.5' : '1.5'}
                      className="transition-colors hover:opacity-90 cursor-pointer"
                      onClick={() => {
                        setSelectedDistrict(d);
                        setSelectedFacility(null);
                      }}
                    />
                    <text
                      x={cx}
                      y={cy - 12}
                      textAnchor="middle"
                      className="text-[11px] font-semibold fill-[#123c30] pointer-events-none select-none tracking-tight"
                    >
                      {d.name}
                    </text>
                    <text
                      x={cx}
                      y={cy + 4}
                      textAnchor="middle"
                      className="text-[9.5px] fill-[#5d6b60] pointer-events-none select-none"
                    >
                      Pop: {(d.population / 1000).toFixed(0)}k &bull; {d.healthZone}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* Inter-facility Redistribution Transfer Corridors */}
          {activeLayers.transfers && (
            <g className="transfers-layer">
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="8"
                  markerHeight="6"
                  refX="7"
                  refY="3"
                  orient="auto"
                >
                  <polygon points="0 0, 8 3, 0 6" fill="#1b5742" />
                </marker>
              </defs>
              {transferRoutes.map((tr) => {
                const [x1, y1] = project(tr.from[0], tr.from[1]);
                const [x2, y2] = project(tr.to[0], tr.to[1]);
                const midX = (x1 + x2) / 2;
                const midY = (y1 + y2) / 2 - 25; // Curve arc

                return (
                  <g key={tr.id}>
                    <path
                      d={`M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`}
                      fill="none"
                      stroke="#1b5742"
                      strokeWidth="2.5"
                      strokeDasharray="6 4"
                      markerEnd="url(#arrowhead)"
                      className="animate-pulse opacity-85"
                    />
                    <circle cx={midX} cy={midY} r="10" fill="#ffffff" stroke="#1b5742" strokeWidth="1.5" />
                    <text
                      x={midX}
                      y={midY + 3.5}
                      textAnchor="middle"
                      className="text-[9px] font-bold fill-[#1b5742]"
                    >
                      &rarr;
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* Health Facility Markers Layer */}
          {activeLayers.facilities && (
            <g className="facility-markers">
              {facilityPoints.map((fp) => {
                const [fx, fy] = project(fp.coordinates[0], fp.coordinates[1]);
                const isSelected = selectedFacility?.external_id === fp.external_id;

                let markerColor = '#1b5742'; // Stable
                let pulseColor = '#a8d5be';
                if (fp.riskLevel === 'Critical') {
                  markerColor = '#b44940';
                  pulseColor = '#f5c6c2';
                } else if (fp.riskLevel === 'Elevated') {
                  markerColor = '#875b16';
                  pulseColor = '#fae1b8';
                }

                return (
                  <g
                    key={fp.external_id}
                    className="cursor-pointer group"
                    onClick={() => {
                      setSelectedFacility(fp);
                      if (onSelectFacility) onSelectFacility(fp.external_id);
                    }}
                  >
                    {/* Pulsing ring for critical/elevated facilities */}
                    {fp.riskLevel !== 'Stable' && (
                      <circle
                        cx={fx}
                        cy={fy}
                        r={isSelected ? '14' : '10'}
                        fill={pulseColor}
                        className="animate-ping opacity-60 pointer-events-none"
                      />
                    )}

                    <circle
                      cx={fx}
                      cy={fy}
                      r={isSelected ? '7' : '5'}
                      fill={markerColor}
                      stroke="#ffffff"
                      strokeWidth={isSelected ? '2.5' : '1.5'}
                    />

                    {/* Facility Title Tag */}
                    <rect
                      x={fx + 8}
                      y={fy - 9}
                      width={fp.name.length * 6.2 + 10}
                      height="17"
                      rx="3"
                      fill="#ffffff"
                      stroke="#dbe2d8"
                      strokeWidth="0.8"
                      className="opacity-95 shadow-sm"
                    />
                    <text
                      x={fx + 12}
                      y={fy + 3}
                      className="text-[9.5px] font-medium fill-[#25342e] select-none"
                    >
                      {fp.name}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
        </svg>

        {/* Floating Map Legend */}
        <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-sm p-3 rounded-lg border border-[#e2e7df] shadow-md text-xs z-10 max-w-xs">
          <div className="font-semibold text-[#123c30] mb-1.5 flex items-center justify-between">
            <span>Spatial Legend</span>
            <span className="text-[10px] text-[#5d6b60]">WGS84 &bull; GeoJSON</span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#b44940] inline-block border border-white" />
              <span className="text-[#25342e]">Critical Stockout Risk (&lt;14 Days)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#875b16] inline-block border border-white" />
              <span className="text-[#25342e]">Elevated Risk (14&ndash;21 Days)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#1b5742] inline-block border border-white" />
              <span className="text-[#25342e]">Adequate Coverage (&gt;21 Days)</span>
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-[#f0f3ee]">
              <span className="w-4 h-0.5 border-t-2 border-dashed border-[#1b5742]" />
              <span className="text-[#5d6b60]">Active Redistribution Route</span>
            </div>
          </div>
        </div>

        {/* Selected Facility / District Drawer */}
        {(selectedFacility || selectedDistrict) && (
          <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-sm p-4 rounded-xl border border-[#dbe2d8] shadow-lg text-xs w-72 z-20 transition-all">
            <div className="flex items-start justify-between mb-2">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#5d6b60]">
                  {selectedFacility ? 'Health Facility Node' : 'Administrative District'}
                </span>
                <h4 className="text-sm font-bold text-[#123c30] mt-0.5">
                  {selectedFacility ? selectedFacility.name : selectedDistrict?.name}
                </h4>
              </div>
              <button
                onClick={() => {
                  setSelectedFacility(null);
                  setSelectedDistrict(null);
                }}
                className="text-[#8e9b90] hover:text-[#25342e] text-base leading-none p-1"
                aria-label="Close details"
              >
                &times;
              </button>
            </div>

            {selectedFacility && (
              <div className="space-y-2 pt-1 border-t border-[#f0f3ee]">
                <div className="flex items-center justify-between">
                  <span className="text-[#5d6b60]">Risk Assessment:</span>
                  <span
                    className={`px-2 py-0.5 rounded font-semibold text-[10px] ${
                      selectedFacility.riskLevel === 'Critical'
                        ? 'bg-[#fdeae8] text-[#b44940]'
                        : selectedFacility.riskLevel === 'Elevated'
                          ? 'bg-[#fef5e7] text-[#875b16]'
                          : 'bg-[#eef5f1] text-[#1b5742]'
                    }`}
                  >
                    {selectedFacility.riskLevel} Risk
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#5d6b60]">Average Coverage:</span>
                  <span className="font-semibold text-[#123c30]">{selectedFacility.daysOfStock} Days</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#5d6b60]">Country &amp; Jurisdiction:</span>
                  <span className="text-[#25342e]">{selectedFacility.country}</span>
                </div>
                {selectedFacility.criticalMedicines && selectedFacility.criticalMedicines.length > 0 && (
                  <div className="mt-2 bg-[#fdeae8] p-2 rounded border border-[#fadad7]">
                    <span className="font-semibold text-[#b44940] block mb-1">Stockout Alerts:</span>
                    <ul className="list-disc pl-4 text-[10.5px] text-[#8c2b23] space-y-0.5">
                      {selectedFacility.criticalMedicines.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {selectedDistrict && !selectedFacility && (
              <div className="space-y-2 pt-1 border-t border-[#f0f3ee]">
                <div className="flex items-center justify-between">
                  <span className="text-[#5d6b60]">Catchment Population:</span>
                  <span className="font-semibold text-[#123c30]">{selectedDistrict.population.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#5d6b60]">Assigned Facilities:</span>
                  <span className="font-semibold text-[#123c30]">{selectedDistrict.facilities.length} Facilities</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#5d6b60]">Health Zone:</span>
                  <span className="text-[#25342e]">{selectedDistrict.healthZone}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

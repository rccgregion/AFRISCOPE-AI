#!/usr/bin/env python3
"""Deterministic, entirely synthetic fixtures. No external data or dependencies."""
import csv
import json
import random
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'demo'
OUT.mkdir(parents=True, exist_ok=True)
rng = random.Random(20260930)
AS_OF = date(2026, 9, 30)
ORG = '00000000-0000-4000-8000-000000000001'
PROJECTS = [f'10000000-0000-4000-8000-{i:012d}' for i in (1, 2, 3)]

def write(name, rows):
    with (OUT / name).open('w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader(); w.writerows(rows)

facilities = []
for i in range(1, 13):
    country = 'Kijani Republic' if i <= 6 else 'Umoja Federation'
    facilities.append(dict(external_id=f'F{i:03}', name=f'{["Mtoni", "Kijiji", "Nyota", "Msitu", "Upendo", "Amani"][i-1] if i<=6 else ["Baraka", "Nuru", "Furaha", "Tumaini", "Imani", "Pamoja"][i-7]} {"Clinic" if i%3 else "Health Centre"}', country=country, region='Northern Zone' if i%2 else 'Central Zone', district=f'District {(i-1)//2+1}', facility_type='Health centre' if i%3==0 else 'Clinic'))
write('facilities.csv', facilities)
products = [dict(external_id='MED001', name='Amoxicillin 500 mg', unit='capsules', minimum_days=14, near_expiry_days=60), dict(external_id='MED002', name='Oral rehydration salts', unit='sachets', minimum_days=14, near_expiry_days=60), dict(external_id='MED003', name='Paracetamol 500 mg', unit='tablets', minimum_days=14, near_expiry_days=60), dict(external_id='MED004', name='Artemether / lumefantrine', unit='tablets', minimum_days=14, near_expiry_days=60)]
write('medicine_products.csv', products)
inventory, deliveries = [], []
for fi, facility in enumerate(facilities):
    for pi, product in enumerate(products):
        stock = 1600 + fi*37 + pi*100
        base = 130 + fi*11 + pi*22
        for week in range(52):
            reporting = AS_OF - timedelta(weeks=51-week)
            demand = round(base * (1 + .18*((week//4)%4-1.5)/1.5) + rng.gauss(0, base*.12))
            demand = max(10, demand)
            received = 0
            if stock < base*3 and week < 51:
                # Deterministic delayed replenishment for selected final-quarter series.
                if not (fi in (0, 2, 6) and pi==0 and week>46):
                    received = ((base*8 - stock + 49)//50)*50
            consumed = min(max(0, stock+received), demand)
            opening = stock
            if week == 51:
                target = ([0, 90, 6400, 1900, 150, 2300, 40, 3100, 1800, 80, 4200, 1600][fi] if pi==0 else 1200+fi*65+pi*180)
                consumed = min(demand, opening)
                received = max(0, target-opening+consumed)
            stock = opening+received-consumed
            expired = 0
            reserved = min(50, stock) if week==51 and fi%3==0 else 0
            expiry = AS_OF + timedelta(days=20 if week==51 and fi==2 and pi==0 else 220+pi*35)
            inventory.append(dict(country=facility['country'], region=facility['region'], district=facility['district'], facility_id=facility['external_id'], facility_type=facility['facility_type'], product_id=product['external_id'], medicine_name=product['name'], unit=product['unit'], reporting_date=reporting.isoformat(), opening_stock=opening, quantity_received=received, quantity_dispensed=consumed, adjustments=0, closing_stock=stock, usable_stock=stock-expired-reserved, reserved_stock=reserved, expired_stock=expired, stockout_days=2 if stock==0 else 0, supplier='Synthetic regional medical store', expected_delivery_date=(AS_OF+timedelta(days=28 if fi%2 else 10)).isoformat(), delivery_lead_time_days=28 if fi%2 else 10, batch_identifier=f'B-{fi+1}-{pi+1}-{week//13}', expiry_date=expiry.isoformat(), minimum_stock=base, maximum_stock=base*16, data_source='AfriScope fixed-seed generator', data_quality_status='Validated synthetic'))
            if week==51:
                deliveries.append(dict(external_id=f'DEL-{fi+1}-{pi+1}', facility_id=facility['external_id'], product_id=product['external_id'], expected_date=(AS_OF+timedelta(days=28 if fi%2 else 10)).isoformat(), quantity=base*8, unit=product['unit'], lead_time_days=28 if fi%2 else 10, status='Delayed' if fi in (0,2,6) and pi==0 else 'Scheduled'))
write('inventory.csv', inventory)
write('deliveries.csv', deliveries)
write('consumption.csv', [dict(facility_id=r['facility_id'], product_id=r['product_id'], period_start=(date.fromisoformat(r['reporting_date'])-timedelta(days=6)).isoformat(), period_end=r['reporting_date'], quantity=r['quantity_dispensed'], unit=r['unit']) for r in inventory])
programmes = [('PRG-001','Essential medicines continuity','NGN',120000000),('PRG-002','Primary care outreach','NGN',85000000),('PRG-003','District cold-chain strengthening','KES',16000000),('PRG-004','Community health worker training','KES',12000000)]
budgets, releases, procurement, expenditure = [], [], [], []
for i,(code,name,currency,amount) in enumerate(programmes):
    period='2026-Q3'
    budgets.append(dict(external_id=f'BUD-{i+1}', programme_code=code, programme_name=name, funding_source='Synthetic development fund', currency=currency, period=period, amount=amount, geography=facilities[i*3]['district']))
    for j, fraction in enumerate((.4,.35)):
        due=AS_OF-timedelta(days=45-j*25+i*4)
        delayed=(i+j)%3==0
        releases.append(dict(external_id=f'REL-{i+1}-{j+1}', budget_id=f'BUD-{i+1}', currency=currency, amount=round(amount*fraction), due_date=due.isoformat(), released_date='' if delayed else (due+timedelta(days=3)).isoformat(), status='Pending' if delayed else 'Released', period=period))
    procurement.append(dict(external_id=f'PO-{i+1}', programme_code=code, title=f'{name} — supply contract', stage='Contract review' if i%2 else 'Tender evaluation', currency=currency, amount=round(amount*.25), started_date=(AS_OF-timedelta(days=40+i*8)).isoformat(), due_date=(AS_OF-timedelta(days=10+i*8)).isoformat(), completed_date='', expected_days=21, supplier='Synthetic supplier', approval_reference=''))
    for j in range(3):
        expenditure.append(dict(external_id=f'EXP-{i+1}-{j+1}', programme_code=code, budget_id=f'BUD-{i+1}', event_type=['Commitment','Payment','Expenditure'][j], currency=currency, amount=round(amount*(.25,.15,.12)[j]), transaction_date=(AS_OF-timedelta(days=30-j*8)).isoformat(), period=period, reference=f'PO-{i+1}', description=['Purchase order commitment','Supplier payment','Recognised expenditure'][j]))
expenditure.append(dict(external_id='EXP-UNMATCHED', programme_code='PRG-UNKNOWN', budget_id='', event_type='Payment', currency='NGN', amount=1750000, transaction_date=AS_OF.isoformat(), period='2026-Q3', reference='MISSING-PO', description='Synthetic unmatched payment for reconciliation testing'))
for name, rows in [('budgets',budgets),('funding_releases',releases),('procurement_events',procurement),('expenditure_records',expenditure)]: write(name+'.csv',rows)
options=[]
intervention_data=[('Community outreach packs',35000,2400,'Rural','Northern Zone',2,[]),('Facility stock visibility',48000,3100,'All facilities','Central Zone',3,[]),('Community health worker training',60000,4200,'Rural','Northern Zone',4,[]),('Cold-chain maintenance',72000,2800,'Facility staff','Central Zone',3,[]),('Integrated supply deliveries',55000,3700,'All facilities','Northern Zone',3,['opt-2']),('Remote mentoring',24000,1500,'Rural','Central Zone',2,[]),('Facility supervision visits',30000,1900,'Facility staff','Northern Zone',2,[]),('Demand planning workshops',20000,1100,'All facilities','Central Zone',2,[])]
for i,(name,cost,outcome,equity,geo,months,deps) in enumerate(intervention_data,1):
    options.append(dict(id=f'opt-{i}',name=name,target_population='Synthetic catchment population',geography=geo,cost=cost,currency='USD',unit_cost=round(cost/outcome,2),expected_outcome=outcome,outcome_unit='People reached (assumed)',evidence_source='Synthetic planning assumption; not a clinical estimate',evidence_quality='Unverified demonstration assumption',capacity=outcome,implementation_months=months,constraints='One discrete delivery package; no double counting adjustment available',equity_group=equity,dependencies=json.dumps(deps)))
write('intervention_options.csv',options)
write('budget_scenarios.csv',[dict(name=n,budget=b,equity_minimum=2,max_months=4,required_geographies=json.dumps(['Northern Zone','Central Zone'])) for n,b in [('Essential coverage',90000),('Balanced scale-up',160000),('Expanded delivery',230000)]])
# Defects are quarantined in a separate upload fixture, never seeded into clean results.
defects=[dict(r) for r in inventory[:8]]
defects[0]['closing_stock']=-4
defects[1]['quantity_dispensed']=''
defects[2]['unit']='litres'
defects[3]['reporting_date']='2026-02-31'
defects[4]['facility_id']='F-MISSING'
defects[5]['expiry_date']='2025-01-01'
defects[6]=dict(defects[5])
defects[7]['usable_stock']=999999
write('inventory_defects.csv',defects)
(OUT/'manifest.json').write_text(json.dumps({'seed':20260930,'as_of':AS_OF.isoformat(),'organisation_id':ORG,'project_ids':PROJECTS,'synthetic':True,'counts':{p.name:p.read_text().count('\n')-1 for p in OUT.glob('*.csv')},'limitations':['Fictional countries, facilities, programmes and assumptions.','Weekly consumption is censored during stockouts; it is not uncensored demand.','No exchange rates, clinical effect estimates, or real personal data.']},indent=2)+'\n')
print(json.dumps({'seed':20260930,'inventory_rows':len(inventory),'files':len(list(OUT.glob('*.csv')))}))

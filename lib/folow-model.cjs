// Adapted from the existing P&T Floot Folow parser; no I/O or source modification.
(function(folowModel) {
    folowModel.version = '2.0.0-floot-folow';
    folowModel.fields = {
        date: 'date',
        invoice: 'inv.',
        customer: 'customer',
        qty: 'qty',
        net: 'net total',
        vat: 'value added tax 7%',
        gross: 'grand total',
        company: 'บริษัท',
        note: 'หมายเหตุ',
        month: 'month (no.)',
        year: 'year'
    };
    folowModel.text = (v)=>v == null ? '' : String(v).normalize('NFKC').trim();
    function numeric(v) {
        if (v == null || typeof v === 'boolean') return null;
        if (typeof v === 'number') return Number.isFinite(v) ? v : null;
        let s = folowModel.text(v).replace(/[\s,]/g, '');
        if (/^\(.*\)$/.test(s)) s = '-' + s.slice(1, -1);
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return null;
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
    }
    folowModel.numeric = numeric;
    function cents(n) { return require('./money.cjs').multiplyMinor(n); }
    folowModel.cents = cents;
    function sum(values) {
        const ns = values.filter((v)=>v !== null);
        if (!ns.length) return null;
        let n = 0;
        for (const x of ns){
            n += x;
            if (!Number.isSafeInteger(n)) throw Error('MONEY_RANGE_EXCEEDED');
        }
        return n;
    }
    folowModel.sum = sum;
    function year(v) {
        let n = numeric(v);
        if (n === null || !Number.isInteger(n)) return null;
        if (n >= 2400) n -= 543;
        return n >= 2000 && n <= 2199 ? n : null;
    }
    folowModel.year = year;
    function day(v) {
        if (typeof v === 'number' && Number.isFinite(v) && v >= 36526 && v <= 109574) return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10);
        const s = folowModel.text(v);
        let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s), y, mo, d;
        if (m) {
            y = year(m[1]);
            mo = +m[2];
            d = +m[3];
        } else {
            m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
            if (!m) return null;
            y = year(m[3]);
            mo = +m[2];
            d = +m[1];
        }
        if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
        const dt = new Date(Date.UTC(y, mo - 1, d));
        return dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
    }
    folowModel.day = day;
    function period(y, m) {
        return y && m !== null && Number.isInteger(m) && m >= 1 && m <= 12 ? `${y}-${String(m).padStart(2, '0')}` : null;
    }
    folowModel.period = period;
    function headers(row) {
        const out = {};
        for (const f of Object.keys(folowModel.fields)){
            const hits = row.flatMap((v, i)=>folowModel.text(v).replace(/\s+/g, ' ').toLowerCase() === folowModel.fields[f] ? [
                    i
                ] : []);
            if (hits.length !== 1) throw Error(`HEADER_${hits.length ? 'AMBIGUOUS' : 'MISSING'}:${f}`);
            out[f] = hits[0];
        }
        return out;
    }
    folowModel.headers = headers;
    function analyze(grid, month, asOf, company = 'P&T') {
        const companyKey = folowModel.text(company).toUpperCase();
        if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month) || !day(asOf)) throw Error('INVALID_SCOPE');
        if (!Array.isArray(grid) || !grid.length) throw Error('SOURCE_EMPTY_OR_MISSING_HEADER');
        if (grid.length > 50001) throw Error('SOURCE_TOO_LARGE');
        const h = headers(grid[0]);
        const all = [];
        let empty = 0;
        grid.slice(1).forEach((cells, i)=>{
            const raw = Object.fromEntries(Object.keys(h).map((k)=>[
                    k,
                    cells[h[k]]
                ]));
            const signal = [
                'date',
                'invoice',
                'customer',
                'note'
            ].some((k)=>folowModel.text(raw[k]) !== '') || [
                'net',
                'gross',
                'qty'
            ].some((k)=>{
                const n = numeric(raw[k]);
                return n !== null && n !== 0;
            });
            if (!signal) {
                empty++;
                return;
            }
            const note = folowModel.text(raw.note), credit = /ใบลดหนี้|\bCREDIT\s+NOTE\b/i.test(note), debit = /ใบเพิ่มหนี้|\bDEBIT\s+NOTE\b/i.test(note);
            const r = {
                id: `Folow:${i + 2}`,
                row: i + 2,
                date: day(raw.date),
                rawDate: folowModel.text(raw.date),
                invoice: folowModel.text(raw.invoice),
                customer: folowModel.text(raw.customer),
                company: folowModel.text(raw.company).toUpperCase(),
                note,
                type: credit && debit ? 'AMBIGUOUS' : credit ? 'CREDIT_NOTE' : debit ? 'DEBIT_NOTE' : 'INVOICE',
                year: year(raw.year),
                month: numeric(raw.month),
                period: null,
                qty: numeric(raw.qty),
                netMinor: cents(numeric(raw.net)),
                vat: numeric(raw.vat),
                gross: numeric(raw.gross),
                valueMinor: null,
                issues: [],
                warnings: [],
                status: 'REVIEW',
                formula: 'Net Total (F) ก่อน VAT ตามเครื่องหมายเดิม — ไม่หาร 1.07'
            };
            r.period = period(r.year, r.month);
            const reserved = !!r.invoice && !r.date && !r.customer && r.netMinor === null && (r.gross === null || r.gross === 0) && !note;
            if (reserved) r.status = 'RESERVED';
            else {
                if (!r.company) r.issues.push('COMPANY_MISSING');
                if (!r.period) r.issues.push('PERIOD_INVALID');
                if (!r.date) r.issues.push('DATE_INVALID');
                if (r.period && r.date && r.period !== r.date.slice(0, 7)) r.issues.push('PERIOD_DATE_CONFLICT');
                if (!r.invoice) r.issues.push('INVOICE_MISSING');
                if (!r.customer) r.issues.push('CUSTOMER_MISSING');
                if (r.netMinor === null) r.issues.push('NET_TOTAL_MISSING');
                if (r.qty === null) r.warnings.push('QUANTITY_MISSING');
                if (r.vat === null || r.gross === null) r.warnings.push('TAX_ARITHMETIC_UNVERIFIED');
                else if (r.netMinor !== null && Math.abs(r.netMinor / 100 + r.vat - r.gross) > 0.020001) r.issues.push('NET_VAT_GROSS_MISMATCH');
                if (r.type === 'AMBIGUOUS' || r.type === 'CREDIT_NOTE' && (r.netMinor ?? 0) > 0 || r.type === 'DEBIT_NOTE' && (r.netMinor ?? 0) < 0 || r.type === 'INVOICE' && (r.netMinor ?? 0) < 0) r.issues.push('DOCUMENT_SIGN_REVIEW');
                if (/ยกเลิก|\bCANCEL(?:LED|ED)?\b/i.test(note)) r.issues.push('CANCELLATION_REVIEW');
                if (r.date && r.date > asOf) r.issues.push('FUTURE_DOCUMENT');
            }
            all.push(r);
        });
        const groups = new Map();
        for (const r of all){
            if (r.status === 'RESERVED' || !r.company || !r.year || !r.invoice) continue;
            const k = JSON.stringify([
                r.company,
                r.year,
                r.type,
                r.invoice.toUpperCase()
            ]);
            groups.set(k, [
                ...groups.get(k) || [],
                r
            ]);
        }
        for (const rs of groups.values())if (rs.length > 1) for (const r of rs)r.issues.push('DUPLICATE_DOCUMENT_REVIEW');
        const rows = all.filter((r)=>(!r.company || r.company === companyKey) && (r.period === month || r.date?.slice(0, 7) === month || !r.period && !r.date));
        for (const r of rows)if (r.status !== 'RESERVED') {
            r.status = r.issues.length ? 'REVIEW' : 'INCLUDED';
            r.valueMinor = r.status === 'INCLUDED' ? r.netMinor : null;
        }
        const active = rows.filter((r)=>r.status !== 'RESERVED'), included = active.filter((r)=>r.status === 'INCLUDED'), review = active.filter((r)=>r.status === 'REVIEW');
        return {
            version: folowModel.version,
            month,
            asOf,
            company: companyKey,
            rows,
            valueMinor: sum(included.map((r)=>r.valueMinor)),
            registerMinor: sum(active.filter((r)=>r.company === companyKey && r.period === month && r.date && r.date <= asOf).map((r)=>r.netMinor)),
            reviewMinor: sum(review.map((r)=>r.netMinor)),
            totalRows: active.length,
            valuedRows: included.length,
            reviewRows: review.length,
            reservedRows: rows.length - active.length,
            unknownAmountRows: review.filter((r)=>r.netMinor === null).length,
            rowCoveragePct: active.length ? Math.round(included.length / active.length * 1000) / 10 : null,
            status: !active.length ? 'NO_DATA' : review.length || active.some((r)=>r.warnings.length) ? 'REVIEW' : 'RULES_PASSED',
            businessCertified: false,
            emptyRows: empty,
            otherCompanyRows: all.filter((r)=>r.company && r.company !== companyKey).length
        };
    }
    folowModel.analyze = analyze;
})(folowModel || (folowModel = {}));
var folowModel;

module.exports={folowModel};

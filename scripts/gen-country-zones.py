#!/usr/bin/env python3
"""
Builds src/lib/countryZones.generated.ts: every country, the time zone(s)
families there use, and words to search by. Run it again when tzdata changes:

    python3 scripts/gen-country-zones.py

Source: the IANA tz database tables on this machine (zone.tab, iso3166.tab).
Countries spanning several zones get hand-written regions below (a family in
Toronto should see "Eastern (Toronto, Montreal)", not "EST - ON (Atikokan)");
other countries keep one entry per distinct UTC offset.
"""
from collections import OrderedDict, defaultdict
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import json, os

TAB = "/usr/share/zoneinfo"
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "lib", "countryZones.generated.ts")

SKIP = {"AQ", "BV", "HM", "TF", "GS", "UM"}

# Names as families write them (and as the booking and application forms list them).
NAMES = {
    "GB": "United Kingdom", "US": "United States", "AE": "United Arab Emirates", "KR": "South Korea", "KP": "North Korea",
    "CD": "DR Congo", "CG": "Congo", "CZ": "Czechia", "CI": "Côte d'Ivoire", "TL": "Timor-Leste", "SZ": "Eswatini",
    "MM": "Myanmar", "BA": "Bosnia and Herzegovina", "CF": "Central African Republic", "LC": "Saint Lucia",
    "WS": "Samoa", "AS": "American Samoa", "TT": "Trinidad and Tobago", "AG": "Antigua and Barbuda",
    "ST": "São Tomé and Príncipe", "KN": "Saint Kitts and Nevis", "VC": "Saint Vincent and the Grenadines",
    "BL": "Saint Barthélemy", "SH": "Saint Helena", "MF": "Saint Martin", "SX": "Sint Maarten", "PM": "Saint Pierre and Miquelon",
    "TC": "Turks and Caicos Islands", "VG": "British Virgin Islands", "VI": "US Virgin Islands", "WF": "Wallis and Futuna",
    "SJ": "Svalbard", "BQ": "Caribbean Netherlands", "TR": "Turkey", "VA": "Vatican City", "PS": "Palestine",
    "IR": "Iran", "SY": "Syria", "RU": "Russia", "LA": "Laos", "MD": "Moldova", "TZ": "Tanzania", "VN": "Vietnam",
    "BN": "Brunei", "BO": "Bolivia", "VE": "Venezuela", "FM": "Micronesia", "MK": "North Macedonia",
}

# Extra search words: other names, big cities, common abbreviations.
KEYWORDS = {
    "GB": "uk britain great britain england scotland wales northern ireland gb london birmingham manchester leeds bradford leicester",
    "IE": "eire dublin", "US": "usa america united states of america", "CA": "canada",
    "AE": "uae emirates dubai abu dhabi sharjah ajman", "SA": "ksa saudi makkah mecca madinah medina jeddah riyadh dammam",
    "QA": "doha", "KW": "kuwait city", "BH": "manama", "OM": "muscat", "JO": "amman", "EG": "cairo alexandria",
    "PK": "karachi lahore islamabad rawalpindi faisalabad peshawar", "IN": "delhi mumbai hyderabad bangalore kolkata chennai",
    "BD": "dhaka sylhet chittagong", "NG": "lagos abuja kano ibadan", "GH": "accra", "KE": "nairobi mombasa",
    "SO": "mogadishu hargeisa somaliland", "ET": "addis ababa", "ZA": "johannesburg cape town durban", "MA": "casablanca rabat",
    "DZ": "algiers", "TN": "tunis", "LY": "tripoli", "SD": "khartoum", "TR": "turkiye istanbul ankara",
    "MY": "kuala lumpur penang", "SG": "singapore", "ID": "jakarta bali surabaya", "BN": "bandar seri begawan",
    "AU": "sydney melbourne brisbane perth adelaide", "NZ": "auckland wellington", "FR": "paris", "DE": "berlin",
    "NL": "holland amsterdam", "BE": "brussels", "ES": "madrid barcelona", "IT": "rome milan", "SE": "stockholm",
    "NO": "oslo", "DK": "copenhagen", "CH": "zurich geneva", "AT": "vienna", "GR": "athens", "CY": "nicosia",
    "MV": "male", "LK": "colombo", "AF": "kabul", "IQ": "baghdad erbil", "LB": "beirut", "PS": "gaza ramallah",
    "YE": "sanaa aden", "UZ": "tashkent", "KZ": "almaty astana", "AZ": "baku", "GM": "banjul", "SN": "dakar",
    "TZ": "dar es salaam zanzibar", "UG": "kampala", "RW": "kigali", "MU": "port louis", "CN": "beijing shanghai",
    "JP": "tokyo", "KR": "seoul", "HK": "hong kong", "TH": "bangkok", "PH": "manila", "MX": "mexico city",
    "BR": "sao paulo rio", "TT": "port of spain", "GY": "georgetown",
}

# Countries with several zones: regions as people say them, most populous first.
REGIONS = {
    "US": [("America/New_York", "Eastern (New York, Atlanta, Miami)"), ("America/Chicago", "Central (Chicago, Houston, Dallas)"),
           ("America/Denver", "Mountain (Denver, Salt Lake City)"), ("America/Phoenix", "Arizona (Phoenix)"),
           ("America/Los_Angeles", "Pacific (Los Angeles, San Francisco, Seattle)"), ("America/Anchorage", "Alaska"), ("Pacific/Honolulu", "Hawaii")],
    "CA": [("America/Toronto", "Eastern (Toronto, Ottawa, Montreal)"), ("America/Vancouver", "Pacific (Vancouver)"),
           ("America/Edmonton", "Mountain (Calgary, Edmonton)"), ("America/Winnipeg", "Central (Winnipeg)"),
           ("America/Regina", "Saskatchewan (Regina, Saskatoon)"), ("America/Halifax", "Atlantic (Halifax)"), ("America/St_Johns", "Newfoundland (St John's)")],
    "AU": [("Australia/Sydney", "New South Wales, Victoria, ACT, Tasmania (Sydney, Melbourne)"), ("Australia/Brisbane", "Queensland (Brisbane)"),
           ("Australia/Perth", "Western Australia (Perth)"), ("Australia/Adelaide", "South Australia (Adelaide)"), ("Australia/Darwin", "Northern Territory (Darwin)")],
    "RU": [("Europe/Moscow", "Moscow, St Petersburg, Kazan"), ("Europe/Kaliningrad", "Kaliningrad"), ("Europe/Samara", "Samara, Udmurtia"),
           ("Asia/Yekaterinburg", "Urals (Yekaterinburg, Bashkortostan)"), ("Asia/Omsk", "Omsk"), ("Asia/Novosibirsk", "Novosibirsk"),
           ("Asia/Krasnoyarsk", "Krasnoyarsk"), ("Asia/Irkutsk", "Irkutsk"), ("Asia/Yakutsk", "Yakutsk"), ("Asia/Vladivostok", "Vladivostok"),
           ("Asia/Magadan", "Magadan"), ("Asia/Kamchatka", "Kamchatka")],
    "BR": [("America/Sao_Paulo", "Brasília time (São Paulo, Rio, Brasília, Salvador)"), ("America/Manaus", "Amazonas (Manaus)"),
           ("America/Rio_Branco", "Acre (Rio Branco)"), ("America/Noronha", "Fernando de Noronha")],
    "MX": [("America/Mexico_City", "Central (Mexico City, Guadalajara, Monterrey)"), ("America/Cancun", "Quintana Roo (Cancún)"),
           ("America/Mazatlan", "Sinaloa, Baja California Sur (Mazatlán)"), ("America/Hermosillo", "Sonora (Hermosillo)"), ("America/Tijuana", "Baja California (Tijuana)")],
    "ID": [("Asia/Jakarta", "Western (Java, Sumatra: Jakarta, Surabaya, Medan)"), ("Asia/Makassar", "Central (Bali, Sulawesi, Kalimantan east and south)"),
           ("Asia/Jayapura", "Eastern (Papua, Maluku)")],
    "CD": [("Africa/Kinshasa", "West (Kinshasa)"), ("Africa/Lubumbashi", "East (Lubumbashi, Goma)")],
    "ES": [("Europe/Madrid", "Mainland Spain, Balearic Islands"), ("Atlantic/Canary", "Canary Islands")],
    "PT": [("Europe/Lisbon", "Mainland Portugal, Madeira"), ("Atlantic/Azores", "Azores")],
    "CL": [("America/Santiago", "Most of Chile"), ("Pacific/Easter", "Easter Island")],
    "EC": [("America/Guayaquil", "Mainland Ecuador"), ("Pacific/Galapagos", "Galápagos Islands")],
    "NZ": [("Pacific/Auckland", "Most of New Zealand"), ("Pacific/Chatham", "Chatham Islands")],
    "CN": [("Asia/Shanghai", "Beijing time (all of China)")],
    "UA": [("Europe/Kiev", "Ukraine")],  # the older name: every browser knows it
    "KZ": None,  # one zone since 2024: generic handling below
}

EXTRA = [("XK", "Kosovo", "Europe/Belgrade", "pristina")]

def offsets(tz):
    a = datetime(2027, 1, 15, 12, tzinfo=timezone.utc).astimezone(ZoneInfo(tz)).utcoffset()
    b = datetime(2027, 7, 15, 12, tzinfo=timezone.utc).astimezone(ZoneInfo(tz)).utcoffset()
    return (a, b)

def flag(cc):
    return "".join(chr(0x1F1E6 + ord(c) - 65) for c in cc)

iso = {}
for line in open(f"{TAB}/iso3166.tab", encoding="utf-8"):
    if line.startswith("#"): continue
    cc, name = line.rstrip("\n").split("\t")
    iso[cc] = name

zones = defaultdict(list)
tz_country = {}
for line in open(f"{TAB}/zone.tab", encoding="utf-8"):
    if line.startswith("#"): continue
    p = line.rstrip("\n").split("\t")
    cc, tz, com = p[0], p[2], (p[3] if len(p) > 3 else "")
    zones[cc].append((tz, com))
    tz_country.setdefault(tz, cc)

countries = []
for cc, raw in iso.items():
    if cc in SKIP or cc not in zones: continue
    name = NAMES.get(cc, raw.replace(" & ", " and ").replace("St ", "Saint "))
    regions = REGIONS.get(cc)
    if regions:
        rows = [{"tz": tz, "label": label} for tz, label in regions]
    else:
        seen = OrderedDict()
        for tz, com in zones[cc]:
            k = offsets(tz)
            if k not in seen: seen[k] = (tz, com)
        vals = list(seen.values())
        if len(vals) == 1:
            rows = [{"tz": vals[0][0], "label": ""}]
        else:
            rows = [{"tz": tz, "label": (com or tz.split("/")[-1].replace("_", " "))} for tz, com in vals]
    cities = " ".join(sorted({tz.split("/")[-1].replace("_", " ").lower() for tz, _ in zones[cc]}))
    words = []
    for w in " ".join([raw.lower(), KEYWORDS.get(cc, ""), cities]).split():
        if w not in words: words.append(w)
    kw = " ".join(words)
    countries.append({"code": cc, "name": name, "flag": flag(cc), "keywords": kw, "zones": rows})

for cc, name, tz, kw in EXTRA:
    countries.append({"code": cc, "name": name, "flag": "", "keywords": kw, "zones": [{"tz": tz, "label": ""}]})

countries.sort(key=lambda c: c["name"].lower())

# Old zone names some devices still report.
for old, new in {"Asia/Calcutta": "Asia/Kolkata", "Europe/Kiev": "Europe/Kyiv", "Asia/Saigon": "Asia/Ho_Chi_Minh",
                 "Asia/Katmandu": "Asia/Kathmandu", "Asia/Rangoon": "Asia/Yangon", "America/Montreal": "America/Toronto",
                 "Asia/Istanbul": "Europe/Istanbul", "Asia/Dacca": "Asia/Dhaka", "Europe/Belfast": "Europe/London",
                 "GB": "Europe/London", "Asia/Ujung_Pandang": "Asia/Makassar", "Africa/Asmera": "Africa/Asmara"}.items():
    if new in tz_country: tz_country.setdefault(old, tz_country[new])
tz_country["Europe/Belgrade"] = "RS"

with open(OUT, "w", encoding="utf-8") as f:
    f.write("// Generated by scripts/gen-country-zones.py from the IANA tz database. Do not edit by hand.\n\n")
    f.write("export type CountryZone = { tz: string; label: string };\n")
    f.write("export type CountryEntry = { code: string; name: string; flag: string; keywords: string; zones: CountryZone[] };\n\n")
    f.write("export const COUNTRY_ZONES: CountryEntry[] = " + "[\n" + ",\n".join(json.dumps(c, ensure_ascii=False) for c in countries) + "\n];\n\n")
    f.write("/** Which country a device's time zone belongs to (the first country listed for it). */\n")
    f.write("export const TZ_COUNTRY: Record<string, string> = " + json.dumps(dict(sorted(tz_country.items()))) + ";\n")
print(len(countries), "countries")

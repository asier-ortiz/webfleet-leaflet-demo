// WEBFLEET.connect API example calls

const API_BASE = 'https://csv.webfleet.com/extern';

const EX_showObjectReportExtern =
    `${API_BASE}?action=showObjectReportExtern&account=ACCOUNT&apikey=APIKEY&username=USER&password=PASS&outputformat=json`;

const EX_showPosition =
    `${API_BASE}?action=showPosition&account=ACCOUNT&apikey=APIKEY&username=USER&password=PASS&objectno=VEHICLE_ID` +
    `&fromdatetime=2025-09-18T00:00:00&todatetime=2025-09-18T23:59:59&outputformat=json`;

console.log({
    EX_showObjectReportExtern,
    EX_showPosition
});

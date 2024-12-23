const request = require('./request');
const { getTodayDate } = require('./utils');
const db = require('./db');
const config = require('./config');
const tr = require('tor-request');

const AVAILABLE_VACCINES = ['COVISHIELD', 'COVAXIN', 'SPUTNIK V'];

function getCalendar() {
  const today = getTodayDate();
  const url = `https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/calendarByPin?pincode=${config.pincode}&date=${today}`;

  if (process.env.NODE_ENV === 'development') {
    return request.get(url);
  } else {
    return new Promise((resolve, reject) => {
      tr.request(url, function (err, res, body) {
        if (err || !res || res.statusCode !== 200) {
          reject(err || new Error(`Request failed with status ${res ? res.statusCode : 'unknown'}`));
          return;
        }
        try {
          body = JSON.parse(body);
          resolve(body);
        } catch (parseErr) {
          reject(new Error(`Failed to parse body ${body} as JSON`));
        }
      });
    });
  }
}

function isSessionAvailable(session) {
  const minAgeFilters = config.minAge || [18, 45];
  const vaccineFilters = config.vaccines || AVAILABLE_VACCINES;

  const isAgeMatching = minAgeFilters.some(minAgeFilter => session.min_age_limit >= minAgeFilter);
  const isVaccineMatching = vaccineFilters.some(vaccineFilter => vaccineFilter.toUpperCase() === session.vaccine);
  const hasSlots = session.available_capacity > 0;
  const isSessionNotified = db.find({ session_id: session.session_id });

  return isAgeMatching && isVaccineMatching && hasSlots && !isSessionNotified;
}

async function getAvailableSessions() {
  try {
    const calendar = await getCalendar();
    const sessions = [];

    for (const center of calendar.centers) {
      for (const session of center.sessions) {
        if (isSessionAvailable(session)) {
          sessions.push({
            ...session,
            address: `${center.address}, ${center.district_name}, ${center.state_name}`,
            name: center.name,
          });
        }
      }
    }

    return sessions;
  } catch (error) {
    console.error('Error fetching available sessions:', error);
    throw error;
  }
}

module.exports = { getAvailableSessions };
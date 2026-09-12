// One in-memory key per unchanged submission; retries keep it, edits replace it.
// No localStorage: application narratives must not persist on a shared browser.
window.ATLFormSubmission = function(form, payload) {
  if (!form._atlResetBound) {
    form.addEventListener('reset', function() { delete form._atlSubmission; });
    form._atlResetBound = true;
  }
  var value = {};
  Object.keys(payload).sort().forEach(function(k) {
    if (k !== 'cf_token' && k !== 'submission_id') value[k] = payload[k];
  });
  var fingerprint = JSON.stringify(value);
  if (!form._atlSubmission || form._atlSubmission.fingerprint !== fingerprint) {
    form._atlSubmission = {fingerprint:fingerprint,id:crypto.randomUUID()};
  }
  payload.submission_id = form._atlSubmission.id;
  return payload;
};

// Shared DOM access and HTML escaping for UI modules.
export const $ = (id) => document.getElementById(id);
export const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ],
  );

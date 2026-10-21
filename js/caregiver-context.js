const CaregiverContext = (() => {
  const ID_KEY = "loreroutine:profileId";
  const NAME_KEY = "loreroutine:profileName";
  const COLOR_KEY = "loreroutine:profileColor";

  function getCurrentId() { return localStorage.getItem(ID_KEY) || null; }
  function getCurrentName() { return localStorage.getItem(NAME_KEY) || ""; }
  function getCurrentColor() { return localStorage.getItem(COLOR_KEY) || ""; }

  function setCurrent(profile) {
    localStorage.setItem(ID_KEY, profile.id);
    localStorage.setItem(NAME_KEY, profile.name);
    localStorage.setItem(COLOR_KEY, profile.avatarColor);
  }

  function clearCurrent() {
    localStorage.removeItem(ID_KEY);
    localStorage.removeItem(NAME_KEY);
    localStorage.removeItem(COLOR_KEY);
  }

  async function init() {
    if (!AuthContext.getToken()) return getCurrentId();
    if (getCurrentId()) return getCurrentId();
    if (location.pathname.endsWith("perfis.html")) return getCurrentId();

    let profiles;
    try {
      profiles = await CaregiverProfilesRepository.getAll();
    } catch (error) {
      return getCurrentId();
    }
    if (profiles.length > 0) {
      location.href = "perfis.html";
      return getCurrentId();
    }
    return getCurrentId();
  }

  const readyPromise = init();

  return Object.freeze({
    clearCurrent, getCurrentColor, getCurrentId, getCurrentName, setCurrent,
    ready: () => readyPromise,
  });
})();

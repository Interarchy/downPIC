export function createHoverIntent({
  schedule = globalThis.setTimeout,
  cancel = globalThis.clearTimeout,
  onShow,
  onHide,
  showDelay = 150,
  hideDelay = 300,
}) {
  let showTimer = null;
  let hideTimer = null;
  let activeImageId = null;
  let overImage = false;
  let overToolbar = false;
  let locked = false;
  let visible = false;

  const clearShow = () => {
    if (showTimer !== null) cancel(showTimer);
    showTimer = null;
  };

  const clearHide = () => {
    if (hideTimer !== null) cancel(hideTimer);
    hideTimer = null;
  };

  const requestHide = () => {
    clearHide();
    if (!visible || locked || overImage || overToolbar) return;
    hideTimer = schedule(() => {
      hideTimer = null;
      if (locked || overImage || overToolbar) return;
      visible = false;
      onHide();
    }, hideDelay);
  };

  return {
    enterImage(imageId) {
      if (locked && visible && activeImageId !== imageId) return;
      const previousImageId = activeImageId;
      clearShow();
      clearHide();
      activeImageId = imageId;
      overImage = true;
      overToolbar = false;
      if (visible && previousImageId !== imageId) {
        visible = false;
        onHide();
      }
      if (visible) {
        return;
      }
      showTimer = schedule(() => {
        showTimer = null;
        if (!overImage || activeImageId !== imageId) return;
        visible = true;
        onShow(imageId);
      }, showDelay);
    },
    leaveImage(imageId) {
      if (activeImageId !== imageId) return;
      overImage = false;
      clearShow();
      requestHide();
    },
    enterToolbar() {
      overToolbar = true;
      clearHide();
    },
    leaveToolbar() {
      overToolbar = false;
      requestHide();
    },
    lock() {
      locked = true;
      clearHide();
    },
    unlock() {
      locked = false;
      requestHide();
    },
    reset() {
      clearShow();
      clearHide();
      activeImageId = null;
      overImage = false;
      overToolbar = false;
      locked = false;
      if (visible) onHide();
      visible = false;
    },
  };
}

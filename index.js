/*
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

(function() {
  var Marzipano = window.Marzipano;
  var screenfull = window.screenfull;
  var data = window.APP_DATA;

  // Grab elements from DOM.
  var panoElement = document.querySelector('#pano');
  var titleBarElement = document.querySelector('#titleBar');
  var sceneTitleElement = document.querySelector('#customTitleSub');
  var sceneListElement = document.querySelector('#sceneList');
  var sceneListItemsElement = document.querySelector('#sceneList .scenes');
  var sceneListToggleElement = document.querySelector('#sceneListToggle');
  var autorotateToggleElement = document.querySelector('#autorotateToggle');
  var fullscreenToggleElement = document.querySelector('#fullscreenToggle');
  var customMenu = document.querySelector('#customMenu');
  var customMenuToggle = document.querySelector('#customMenuToggle');

  // Detect desktop or mobile mode.
  var mql = matchMedia('(max-width: 500px), (max-height: 500px)');
  var setMode = function() {
    document.body.classList.toggle('mobile', mql.matches);
    document.body.classList.toggle('desktop', !mql.matches);
  };
  setMode();
  if (mql.addEventListener) {
    mql.addEventListener('change', setMode);
  } else {
    mql.addListener(setMode);
  }

  // Detect whether we are on a touch device.
  document.body.classList.add('no-touch');
  window.addEventListener('touchstart', function() {
    document.body.classList.remove('no-touch');
    document.body.classList.add('touch');
  });

  // Initialize viewer.
  var viewer = new Marzipano.Viewer(panoElement, {
    controls: { mouseViewMode: data.settings.mouseViewMode }
  });

  // Scenes are created on first visit: building all 309 up front made startup slow.
  var scenes = data.scenes.map(function(sceneData) {
    return { data: sceneData, scene: null, view: null };
  });

  function loadScene(s) {
    if (s.scene) {
      return s;
    }
    var urlPrefix = 'tiles/' + s.data.id;
    var source = Marzipano.ImageUrlSource.fromString(
      urlPrefix + '/{z}/{f}/{y}/{x}.jpg',
      { cubeMapPreviewUrl: urlPrefix + '/preview.jpg' });
    var geometry = new Marzipano.CubeGeometry(s.data.levels);
    var limiter = Marzipano.RectilinearView.limit.traditional(s.data.faceSize, 100*Math.PI/180, 120*Math.PI/180);
    s.view = new Marzipano.RectilinearView(s.data.initialViewParameters, limiter);
    s.scene = viewer.createScene({
      source: source,
      geometry: geometry,
      view: s.view,
      pinFirstLevel: true
    });

    s.data.linkHotspots.forEach(function(hotspot) {
      s.scene.hotspotContainer().createHotspot(createLinkHotspotElement(hotspot), { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });
    s.data.infoHotspots.forEach(function(hotspot) {
      s.scene.hotspotContainer().createHotspot(createInfoHotspotElement(hotspot), { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });
    return s;
  }

  // Build the scene list from data.js, ordered by area number ("<index>-<area>-<slug>").
  function areaOf(s) {
    return parseInt(s.data.id.split('-')[1], 10);
  }
  scenes.slice().sort(function(a, b) {
    return areaOf(a) - areaOf(b);
  }).forEach(function(s) {
    var item = document.createElement('li');
    var link = document.createElement('a');
    link.href = '#';
    link.className = 'scene';
    link.setAttribute('data-id', s.data.id);
    var text = document.createElement('span');
    text.className = 'text';
    text.textContent = s.data.name;
    link.appendChild(text);
    item.appendChild(link);
    sceneListItemsElement.appendChild(item);
  });
  var sceneElements = sceneListItemsElement.querySelectorAll('.scene');

  sceneListItemsElement.addEventListener('click', function(e) {
    var el = e.target.closest('.scene');
    if (!el) {
      return;
    }
    e.preventDefault();
    switchScene(findSceneById(el.getAttribute('data-id')));
    // On mobile, hide scene list after selecting a scene.
    if (document.body.classList.contains('mobile')) {
      setSceneListOpen(false);
    }
  });

  // Set up autorotate, if enabled.
  var autorotate = Marzipano.autorotate({
    yawSpeed: 0.03,
    targetPitch: 0,
    targetFov: Math.PI/2
  });
  if (data.settings.autorotateEnabled) {
    autorotateToggleElement.classList.add('enabled');
  }
  autorotateToggleElement.addEventListener('click', toggleAutorotate);

  // Set up fullscreen mode, if supported.
  if (screenfull.enabled && data.settings.fullscreenButton) {
    document.body.classList.add('fullscreen-enabled');
    fullscreenToggleElement.addEventListener('click', function() {
      screenfull.toggle();
    });
    screenfull.on('change', function() {
      fullscreenToggleElement.classList.toggle('enabled', screenfull.isFullscreen);
    });
  } else {
    document.body.classList.add('fullscreen-disabled');
  }

  // Scene list: the title is hidden while the list is open so they don't overlap.
  function setSceneListOpen(open) {
    sceneListElement.classList.toggle('enabled', open);
    sceneListToggleElement.classList.toggle('enabled', open);
    titleBarElement.style.display = open ? 'none' : '';
  }

  sceneListToggleElement.addEventListener('click', function() {
    setSceneListOpen(!sceneListElement.classList.contains('enabled'));
  });

  // Close the scene list when clicking outside of it.
  document.addEventListener('mousedown', function(e) {
    if (sceneListElement.classList.contains('enabled') &&
        !sceneListElement.contains(e.target) && !sceneListToggleElement.contains(e.target)) {
      setSceneListOpen(false);
    }
  });

  // Start with the scene list open on desktop, then hide it after 5 seconds.
  if (!document.body.classList.contains('mobile')) {
    setSceneListOpen(true);
    setTimeout(function() { setSceneListOpen(false); }, 5000);
  }

  // Associate view controls with elements.
  var velocity = 0.7;
  var friction = 3;
  var controls = viewer.controls();
  [
    ['upElement', '#viewUp', 'y', -velocity],
    ['downElement', '#viewDown', 'y', velocity],
    ['leftElement', '#viewLeft', 'x', -velocity],
    ['rightElement', '#viewRight', 'x', velocity],
    ['inElement', '#viewIn', 'zoom', -velocity],
    ['outElement', '#viewOut', 'zoom', velocity]
  ].forEach(function(c) {
    controls.registerMethod(c[0], new Marzipano.ElementPressControlMethod(document.querySelector(c[1]), c[2], c[3], friction), true);
  });

  function switchScene(s) {
    loadScene(s);
    stopAutorotate();
    s.view.setParameters(s.data.initialViewParameters);
    s.scene.switchTo();
    startAutorotate();
    sceneTitleElement.textContent = s.data.name;
    for (var i = 0; i < sceneElements.length; i++) {
      sceneElements[i].classList.toggle('current', sceneElements[i].getAttribute('data-id') === s.data.id);
    }
  }

  function startAutorotate() {
    if (!autorotateToggleElement.classList.contains('enabled')) {
      return;
    }
    viewer.startMovement(autorotate);
    viewer.setIdleMovement(3000, autorotate);
  }

  function stopAutorotate() {
    viewer.stopMovement();
    viewer.setIdleMovement(Infinity);
  }

  function toggleAutorotate() {
    if (autorotateToggleElement.classList.toggle('enabled')) {
      startAutorotate();
    } else {
      stopAutorotate();
    }
  }

  function createLinkHotspotElement(hotspot) {
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot', 'link-hotspot');

    var icon = document.createElement('img');
    icon.src = 'img/link.png';
    icon.classList.add('link-hotspot-icon');
    icon.style.transform = 'rotate(' + hotspot.rotation + 'rad)';

    wrapper.addEventListener('click', function() {
      switchScene(findSceneById(hotspot.target));
    });

    // Prevent the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    var tooltip = document.createElement('div');
    tooltip.classList.add('hotspot-tooltip', 'link-hotspot-tooltip');
    tooltip.textContent = findSceneById(hotspot.target).data.name;

    wrapper.appendChild(icon);
    wrapper.appendChild(tooltip);
    return wrapper;
  }

  function createInfoHotspotElement(hotspot) {
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot', 'info-hotspot');

    var header = document.createElement('div');
    header.classList.add('info-hotspot-header');

    var iconWrapper = document.createElement('div');
    iconWrapper.classList.add('info-hotspot-icon-wrapper');
    var icon = document.createElement('img');
    icon.src = 'img/info.png';
    icon.classList.add('info-hotspot-icon');
    iconWrapper.appendChild(icon);

    // Title and text are authored in data.js and may contain markup such as <b>.
    var titleWrapper = document.createElement('div');
    titleWrapper.classList.add('info-hotspot-title-wrapper');
    var title = document.createElement('div');
    title.classList.add('info-hotspot-title');
    title.innerHTML = hotspot.title;
    titleWrapper.appendChild(title);

    var closeWrapper = document.createElement('div');
    closeWrapper.classList.add('info-hotspot-close-wrapper');
    var closeIcon = document.createElement('img');
    closeIcon.src = 'img/close.png';
    closeIcon.classList.add('info-hotspot-close-icon');
    closeWrapper.appendChild(closeIcon);

    header.appendChild(iconWrapper);
    header.appendChild(titleWrapper);
    header.appendChild(closeWrapper);

    var text = document.createElement('div');
    text.classList.add('info-hotspot-text');
    text.innerHTML = hotspot.text;

    wrapper.appendChild(header);
    wrapper.appendChild(text);

    // Copy of the hotspot content shown as a modal in mobile mode.
    var modal = document.createElement('div');
    modal.innerHTML = wrapper.innerHTML;
    modal.classList.add('info-hotspot-modal');
    document.body.appendChild(modal);

    var toggle = function() {
      wrapper.classList.toggle('visible');
      modal.classList.toggle('visible');
    };
    wrapper.querySelector('.info-hotspot-header').addEventListener('click', toggle);
    modal.querySelector('.info-hotspot-close-wrapper').addEventListener('click', toggle);

    stopTouchAndScrollEventPropagation(wrapper);
    return wrapper;
  }

  function stopTouchAndScrollEventPropagation(element) {
    ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'wheel', 'mousewheel'].forEach(function(name) {
      element.addEventListener(name, function(event) {
        event.stopPropagation();
      });
    });
  }

  function findSceneById(id) {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].data.id === id) {
        return scenes[i];
      }
    }
    return null;
  }

  // Side menu.
  customMenuToggle.addEventListener('click', function() {
    customMenu.classList.toggle('open');
  });
  document.addEventListener('click', function(e) {
    if (customMenu.classList.contains('open') &&
        !customMenu.contains(e.target) && !customMenuToggle.contains(e.target)) {
      customMenu.classList.remove('open');
    }
  });

  // Modals opened from the side menu. They close with the X, the backdrop or Escape.
  function setupModal(buttonId, modalId) {
    var modal = document.getElementById(modalId);
    var close = function() { modal.classList.remove('open'); };
    document.getElementById(buttonId).addEventListener('click', function(e) {
      e.preventDefault();
      modal.classList.add('open');
    });
    modal.querySelector('.info-tour-modal-close').addEventListener('click', close);
    modal.querySelector('.info-tour-modal-bg').addEventListener('click', close);
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') close();
    });
  }
  setupModal('infoTourBtn', 'infoTourModal');
  setupModal('ubicacionBtn', 'ubicacionModal');
  setupModal('planoBtn', 'planoModal');

  // Display the initial scene.
  switchScene(scenes[0]);

})();

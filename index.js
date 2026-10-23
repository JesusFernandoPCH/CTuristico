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
  var welcomeElement = document.querySelector('#welcome');
  var sceneTitleElement = document.querySelector('#sceneTitle');
  var sceneDiscElement = document.querySelector('#sceneDisc');
  var sceneListElement = document.querySelector('#sceneList');
  var areaListElement = document.querySelector('#sceneList .areas');
  var sceneListToggleElement = document.querySelector('#sceneListToggle');
  var autorotateToggleElement = document.querySelector('#autorotateToggle');
  var fullscreenToggleElement = document.querySelector('#fullscreenToggle');
  var customMenu = document.querySelector('#customMenu');
  var customMenuToggle = document.querySelector('#customMenuToggle');
  // Everything behind the welcome screen; inert until the visitor enters.
  var tourChrome = [panoElement, document.querySelector('.tour-bar'), sceneListElement, customMenu, document.querySelector('.control-bar')];

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

  // Scene ids are "<index>-<area>-<slug>" and names "<area>. <label>".
  function areaOf(s) {
    return parseInt(s.data.id.split('-')[1], 10);
  }
  function labelOf(s) {
    return s.data.name.replace(/^\d+\.\s*/, '');
  }

  // Scene list grouped by the numbered areas of the hotel map. Area names come from
  // data/hotel.json; without it (e.g. opened from file://) the first scene's name is used.
  var sceneElements = [];
  function buildSceneList(areaNames) {
    var groups = {};
    scenes.forEach(function(s) {
      var n = areaOf(s);
      (groups[n] = groups[n] || []).push(s);
    });
    Object.keys(groups).map(Number).sort(function(a, b) { return a - b; }).forEach(function(n) {
      var item = document.createElement('li');
      var single = groups[n].length === 1;
      // An area with one view links straight to it; larger areas expand into their views.
      var head = document.createElement(single ? 'a' : 'button');
      head.className = 'area-head';
      if (single) {
        head.href = '#';
        head.setAttribute('data-id', groups[n][0].data.id);
        sceneElements.push(head);
      } else {
        head.type = 'button';
        head.setAttribute('aria-expanded', 'false');
      }
      var disc = document.createElement('span');
      disc.className = 'disc';
      disc.textContent = n;
      var name = document.createElement('span');
      name.className = 'area-name';
      name.textContent = areaNames[n] || labelOf(groups[n][0]).split(',')[0];
      var count = document.createElement('span');
      count.className = 'area-count';
      count.textContent = groups[n].length === 1 ? '1 vista' : groups[n].length + ' vistas';
      head.appendChild(disc);
      head.appendChild(name);
      head.appendChild(count);
      item.appendChild(head);
      areaListElement.appendChild(item);
      if (single) {
        return;
      }

      var list = document.createElement('ul');
      list.className = 'area-scenes';
      list.hidden = true;
      groups[n].forEach(function(s) {
        var li = document.createElement('li');
        var link = document.createElement('a');
        link.href = '#';
        link.className = 'scene';
        link.setAttribute('data-id', s.data.id);
        link.textContent = labelOf(s);
        li.appendChild(link);
        list.appendChild(li);
        sceneElements.push(link);
      });
      item.appendChild(list);
    });
  }

  function setAreaOpen(head, open) {
    head.setAttribute('aria-expanded', String(open));
    head.nextElementSibling.hidden = !open;
  }

  areaListElement.addEventListener('click', function(e) {
    var el = e.target.closest('[data-id]');
    var head = e.target.closest('.area-head');
    if (!el) {
      if (head) {
        setAreaOpen(head, head.getAttribute('aria-expanded') !== 'true');
      }
      return;
    }
    e.preventDefault();
    switchScene(findSceneById(el.getAttribute('data-id')));
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
    setPressed(autorotateToggleElement, true);
  }
  autorotateToggleElement.addEventListener('click', toggleAutorotate);

  // Set up fullscreen mode, if supported.
  if (screenfull.enabled && data.settings.fullscreenButton) {
    document.body.classList.add('fullscreen-enabled');
    fullscreenToggleElement.addEventListener('click', function() {
      screenfull.toggle();
    });
    screenfull.on('change', function() {
      setPressed(fullscreenToggleElement, screenfull.isFullscreen);
    });
  }

  function setPressed(el, on) {
    el.classList.toggle('enabled', on);
    el.setAttribute('aria-pressed', String(on));
  }

  // Side panels: the scene list on the left, the menu on the right. One open at a time.
  function setSceneListOpen(open) {
    sceneListElement.classList.toggle('enabled', open);
    sceneListToggleElement.setAttribute('aria-expanded', String(open));
    if (open) {
      setMenuOpen(false);
      var current = sceneListElement.querySelector('.scene.current');
      if (current) {
        current.scrollIntoView({ block: 'center' });
      }
    }
  }
  function setMenuOpen(open) {
    customMenu.classList.toggle('open', open);
    customMenuToggle.setAttribute('aria-expanded', String(open));
    if (open) {
      setSceneListOpen(false);
    }
  }

  sceneListToggleElement.addEventListener('click', function() {
    setSceneListOpen(!sceneListElement.classList.contains('enabled'));
  });
  customMenuToggle.addEventListener('click', function() {
    setMenuOpen(!customMenu.classList.contains('open'));
  });
  document.querySelectorAll('[data-close]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (btn.getAttribute('data-close') === 'sceneList') {
        setSceneListOpen(false);
      } else {
        setMenuOpen(false);
      }
    });
  });

  // Close a side panel when pressing outside of it.
  document.addEventListener('mousedown', function(e) {
    if (sceneListElement.classList.contains('enabled') &&
        !sceneListElement.contains(e.target) && !sceneListToggleElement.contains(e.target)) {
      setSceneListOpen(false);
    }
    if (customMenu.classList.contains('open') &&
        !customMenu.contains(e.target) && !customMenuToggle.contains(e.target) && !e.target.closest('.info-tour-modal')) {
      setMenuOpen(false);
    }
  });

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

  var currentScene = null;

  function switchScene(s) {
    loadScene(s);
    currentScene = s;
    stopAutorotate();
    s.view.setParameters(s.data.initialViewParameters);
    s.scene.switchTo();
    startAutorotate();
    sceneDiscElement.textContent = areaOf(s);
    sceneTitleElement.textContent = labelOf(s);
    markCurrent(s);
  }

  function markCurrent(s) {
    for (var i = 0; i < sceneElements.length; i++) {
      var isCurrent = sceneElements[i].getAttribute('data-id') === s.data.id;
      sceneElements[i].classList.toggle('current', isCurrent);
      if (isCurrent) {
        sceneElements[i].setAttribute('aria-current', 'true');
        var group = sceneElements[i].closest('.area-scenes');
        if (group) {
          setAreaOpen(group.previousElementSibling, true);
        }
      } else {
        sceneElements[i].removeAttribute('aria-current');
      }
    }
  }

  // Camera push-in when entering the tour: from a wide field of view to the scene's own.
  function pushIn(s) {
    var target = s.data.initialViewParameters.fov;
    var from = Math.min(target * 1.35, 110*Math.PI/180);
    var duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1600;
    var start = performance.now();
    s.view.setFov(from);
    requestAnimationFrame(function step(now) {
      var p = duration ? Math.min((now - start) / duration, 1) : 1;
      s.view.setFov(from + (target - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) {
        requestAnimationFrame(step);
      }
    });
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
    var on = !autorotateToggleElement.classList.contains('enabled');
    setPressed(autorotateToggleElement, on);
    if (on) {
      startAutorotate();
    } else {
      stopAutorotate();
    }
  }

  // Hotspots live inside the panorama; give them button semantics so Tab and Enter reach them.
  function makeKeyboardButton(el, label, action) {
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    if (label) {
      el.setAttribute('aria-label', label);
    }
    el.addEventListener('click', action);
    el.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        action();
      }
    });
  }

  function createLinkHotspotElement(hotspot) {
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot', 'link-hotspot');

    var icon = document.createElement('img');
    icon.src = 'img/link.png';
    icon.alt = '';
    icon.classList.add('link-hotspot-icon');
    icon.style.transform = 'rotate(' + hotspot.rotation + 'rad)';

    var target = findSceneById(hotspot.target);
    makeKeyboardButton(wrapper, 'Ir a ' + labelOf(target), function() {
      switchScene(target);
    });

    // Prevent the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    var tooltip = document.createElement('div');
    tooltip.classList.add('hotspot-tooltip', 'link-hotspot-tooltip');
    tooltip.textContent = labelOf(target);

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
    icon.alt = '';
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
    closeIcon.alt = 'Cerrar';
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
    makeKeyboardButton(header, null, toggle);
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

  // Modals: any [data-modal] link opens one. They close with "Cerrar", the backdrop or Escape.
  // While a modal is open everything behind it is inert, so focus stays in the dialog.
  var lastFocus = null;
  function setBackgroundInert(inert) {
    var inTour = welcomeElement.classList.contains('is-leaving');
    tourChrome.forEach(function(el) { el.inert = inert || !inTour; });
    welcomeElement.inert = inert || inTour;
  }
  function openModal(id) {
    var modal = document.getElementById(id);
    lastFocus = document.activeElement;
    setMenuOpen(false);
    modal.classList.add('open');
    setBackgroundInert(true);
    modal.querySelector('.info-tour-modal-close').focus();
  }
  function closeModal(modal) {
    modal.classList.remove('open');
    setBackgroundInert(false);
    if (lastFocus && !lastFocus.closest('[inert]')) {
      lastFocus.focus();
    }
  }
  document.querySelectorAll('[data-modal]').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      openModal(link.getAttribute('data-modal'));
    });
  });
  document.querySelectorAll('.info-tour-modal').forEach(function(modal) {
    modal.querySelector('.info-tour-modal-close').addEventListener('click', function() { closeModal(modal); });
    modal.querySelector('.info-tour-modal-bg').addEventListener('click', function() { closeModal(modal); });
  });

  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') {
      return;
    }
    var open = document.querySelector('.info-tour-modal.open');
    if (open) {
      closeModal(open);
    } else {
      setSceneListOpen(false);
      setMenuOpen(false);
    }
  });

  // Welcome screen: the first panorama loads behind it; entering pushes the camera in.
  tourChrome.forEach(function(el) { el.inert = true; });
  function enterTour(then) {
    if (welcomeElement.classList.contains('is-leaving')) {
      return;
    }
    welcomeElement.classList.add('is-leaving');
    setBackgroundInert(false);
    pushIn(currentScene);
    if (then) {
      then();
    } else {
      sceneListToggleElement.focus();
    }
  }
  welcomeElement.querySelectorAll('[data-action]').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.preventDefault();
      if (el.getAttribute('data-action') === 'history') {
        enterTour(function() { openModal('infoTourModal'); });
      } else {
        enterTour();
      }
    });
  });

  // Display the initial scene, then fill the scene list once the area names arrive.
  switchScene(scenes[0]);
  fetch('data/hotel.json')
    .then(function(res) { return res.json(); })
    .then(function(hotel) {
      var names = {};
      hotel.areas.forEach(function(a) { names[a.numero] = a.nombre; });
      return names;
    })
    .catch(function() { return {}; })
    .then(function(names) {
      buildSceneList(names);
      markCurrent(currentScene);
    });

})();

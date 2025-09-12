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

// Permitir cerrar el menú de escenas de Marzipano al hacer clic fuera
document.addEventListener('DOMContentLoaded', function() {
  var sceneListElement = document.getElementById('sceneList');
  var sceneListToggleElement = document.getElementById('sceneListToggle');
  if (sceneListElement && sceneListToggleElement) {
    document.addEventListener('mousedown', function(e) {
      // Si el menú está abierto y el clic no es dentro del menú ni en el botón toggle
      if (sceneListElement.classList.contains('enabled')) {
        if (!sceneListElement.contains(e.target) && !sceneListToggleElement.contains(e.target)) {
          sceneListElement.classList.remove('enabled');
          sceneListToggleElement.classList.remove('enabled');
          // Si tienes lógica para mostrar el título, aquí puedes mostrarlo de nuevo
          var titleBar = document.getElementById('titleBar');
          if (titleBar) titleBar.style.display = '';
        }
      }
    });
  }
});

// --- Modal Información del Tour ---
document.addEventListener('DOMContentLoaded', function() {
  var infoTourBtn = document.getElementById('infoTourBtn');
  var infoTourModal = document.getElementById('infoTourModal');
  var infoTourClose = document.getElementById('infoTourClose');
  var infoTourBg = infoTourModal ? infoTourModal.querySelector('.info-tour-modal-bg') : null;
  if (infoTourBtn && infoTourModal && infoTourClose && infoTourBg) {
    var modalOpen = false;
    function openModal() {
      if (modalOpen) return;
      infoTourModal.classList.add('open');
      modalOpen = true;
    }
    function closeModal() {
      infoTourModal.classList.remove('open');
      modalOpen = false;
    }
    infoTourBtn.addEventListener('click', function(e) {
      e.preventDefault();
      openModal();
    });
    infoTourClose.addEventListener('click', function() {
      closeModal();
    });
    infoTourBg.addEventListener('click', function() {
      closeModal();
    });
    // Opcional: cerrar con ESC
    document.addEventListener('keydown', function(e) {
      if (modalOpen && (e.key === 'Escape' || e.key === 'Esc')) closeModal();
    });
  }
});

// --- Modal Ubicación ---
document.addEventListener('DOMContentLoaded', function() {
  var ubicacionBtn = document.getElementById('ubicacionBtn');
  var ubicacionModal = document.getElementById('ubicacionModal');
  var ubicacionClose = document.getElementById('ubicacionClose');
  var ubicacionBg = ubicacionModal ? ubicacionModal.querySelector('.ubicacion-modal-bg') : null; // Updated class
  if (ubicacionBtn && ubicacionModal && ubicacionClose && ubicacionBg) {
    var modalOpen = false;
    function openModal() {
      if (modalOpen) return;
      ubicacionModal.classList.add('open');
      modalOpen = true;
    }
    function closeModal() {
      ubicacionModal.classList.remove('open');
      modalOpen = false;
    }
    ubicacionBtn.addEventListener('click', function(e) {
      e.preventDefault();
      openModal();
    });
    ubicacionClose.addEventListener('click', function() {
      closeModal();
    });
    ubicacionBg.addEventListener('click', function() {
      closeModal();
    });
    document.addEventListener('keydown', function(e) {
      if (modalOpen && (e.key === 'Escape' || e.key === 'Esc')) closeModal();
    });
  }
});

// --- Modal Plano ---
document.addEventListener('DOMContentLoaded', function() {
  var planoBtn = document.getElementById('planoBtn');
  var planoModal = document.getElementById('planoModal');
  var planoClose = document.getElementById('planoClose');
  var planoBg = planoModal ? planoModal.querySelector('.info-tour-modal-bg') : null;
  if (planoBtn && planoModal && planoClose && planoBg) {
    var modalOpen = false;
    function openModal() {
      if (modalOpen) return;
      planoModal.classList.add('open');
      modalOpen = true;
    }
    function closeModal() {
      planoModal.classList.remove('open');
      modalOpen = false;
    }
    planoBtn.addEventListener('click', function(e) {
      e.preventDefault();
      openModal();
    });
    planoClose.addEventListener('click', function() {
      closeModal();
    });
    planoBg.addEventListener('click', function() {
      closeModal();
    });
    document.addEventListener('keydown', function(e) {
      if (modalOpen && (e.key === 'Escape' || e.key === 'Esc')) closeModal();
    });
  }
});

'use strict';

(function() {
  var Marzipano = window.Marzipano;
  var bowser = window.bowser;
  var screenfull = window.screenfull;
  var data = window.APP_DATA;

  // Grab elements from DOM.
  var panoElement = document.querySelector('#pano');
  var sceneNameElement = document.querySelector('#titleBar .sceneName');
  var sceneListElement = document.querySelector('#sceneList');
  var sceneElements = document.querySelectorAll('#sceneList .scene');
  var sceneListToggleElement = document.querySelector('#sceneListToggle');
  var autorotateToggleElement = document.querySelector('#autorotateToggle');
  var fullscreenToggleElement = document.querySelector('#fullscreenToggle');

  // Detect desktop or mobile mode.
  if (window.matchMedia) {
    var setMode = function() {
      if (mql.matches) {
        document.body.classList.remove('desktop');
        document.body.classList.add('mobile');
      } else {
        document.body.classList.remove('mobile');
        document.body.classList.add('desktop');
      }
    };
    var mql = matchMedia("(max-width: 500px), (max-height: 500px)");
    setMode();
    mql.addListener(setMode);
  } else {
    document.body.classList.add('desktop');
  }

  // Detect whether we are on a touch device.
  document.body.classList.add('no-touch');
  window.addEventListener('touchstart', function() {
    document.body.classList.remove('no-touch');
    document.body.classList.add('touch');
  });

  // Use tooltip fallback mode on IE < 11.
  if (bowser.msie && parseFloat(bowser.version) < 11) {
    document.body.classList.add('tooltip-fallback');
  }

  // Viewer options.
  var viewerOpts = {
    controls: {
      mouseViewMode: data.settings.mouseViewMode
    }
  };

  // Initialize viewer.
  var viewer = new Marzipano.Viewer(panoElement, viewerOpts);

  // Create scenes.
  var scenes = data.scenes.map(function(data) {
    var urlPrefix = "tiles";
    var source = Marzipano.ImageUrlSource.fromString(
      urlPrefix + "/" + data.id + "/{z}/{f}/{y}/{x}.jpg",
      { cubeMapPreviewUrl: urlPrefix + "/" + data.id + "/preview.jpg" });
    var geometry = new Marzipano.CubeGeometry(data.levels);

    var limiter = Marzipano.RectilinearView.limit.traditional(data.faceSize, 100*Math.PI/180, 120*Math.PI/180);
    var view = new Marzipano.RectilinearView(data.initialViewParameters, limiter);

    var scene = viewer.createScene({
      source: source,
      geometry: geometry,
      view: view,
      pinFirstLevel: true
    });

    // Create link hotspots.
    data.linkHotspots.forEach(function(hotspot) {
      var element = createLinkHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    // Create info hotspots.
    data.infoHotspots.forEach(function(hotspot) {
      var element = createInfoHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    return {
      data: data,
      scene: scene,
      view: view
    };
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

  // Set handler for autorotate toggle.
  autorotateToggleElement.addEventListener('click', toggleAutorotate);

  // Set up fullscreen mode, if supported.
  if (screenfull.enabled && data.settings.fullscreenButton) {
    document.body.classList.add('fullscreen-enabled');
    fullscreenToggleElement.addEventListener('click', function() {
      screenfull.toggle();
    });
    screenfull.on('change', function() {
      if (screenfull.isFullscreen) {
        fullscreenToggleElement.classList.add('enabled');
      } else {
        fullscreenToggleElement.classList.remove('enabled');
      }
    });
  } else {
    document.body.classList.add('fullscreen-disabled');
  }

  // Set handler for scene list toggle.
  sceneListToggleElement.addEventListener('click', function(e) {
    toggleSceneList(e);
    // --- Ocultar/mostrar título personalizado según estado del menú de escenas ---
    var titleBar = document.getElementById('titleBar');
    var sceneList = document.getElementById('sceneList');
    // El menú de escenas está abierto si tiene la clase 'enabled'
    var isOpen = sceneList.classList.contains('enabled');
    // Alternar visibilidad del título
    if (isOpen) {
      titleBar.style.display = 'none';
    } else {
      titleBar.style.display = '';
    }
  });

  // Start with the scene list open on desktop.
  if (!document.body.classList.contains('mobile')) {
    showSceneList();
    // Asegura que el título esté oculto si el menú de escenas inicia abierto
    var titleBar = document.getElementById('titleBar');
    if (titleBar) titleBar.style.display = 'none';
    // Cierra el menú de escenas automáticamente después de 5 segundos
    setTimeout(function() {
      hideSceneList();
      if (titleBar) titleBar.style.display = '';
    }, 5000);
  } else {
    // En móvil, asegúrate que el título esté visible al inicio
    var titleBar = document.getElementById('titleBar');
    if (titleBar) titleBar.style.display = '';
  }

  // Set handler for scene switch.
  scenes.forEach(function(scene) {
    var el = document.querySelector('#sceneList .scene[data-id="' + scene.data.id + '"]');
    el.addEventListener('click', function() {
      switchScene(scene);
      // On mobile, hide scene list after selecting a scene.
      if (document.body.classList.contains('mobile')) {
        hideSceneList();
      }
    });
  });

  // DOM elements for view controls.
  var viewUpElement = document.querySelector('#viewUp');
  var viewDownElement = document.querySelector('#viewDown');
  var viewLeftElement = document.querySelector('#viewLeft');
  var viewRightElement = document.querySelector('#viewRight');
  var viewInElement = document.querySelector('#viewIn');
  var viewOutElement = document.querySelector('#viewOut');

  // Dynamic parameters for controls.
  var velocity = 0.7;
  var friction = 3;

  // Associate view controls with elements.
  var controls = viewer.controls();
  controls.registerMethod('upElement',    new Marzipano.ElementPressControlMethod(viewUpElement,     'y', -velocity, friction), true);
  controls.registerMethod('downElement',  new Marzipano.ElementPressControlMethod(viewDownElement,   'y',  velocity, friction), true);
  controls.registerMethod('leftElement',  new Marzipano.ElementPressControlMethod(viewLeftElement,   'x', -velocity, friction), true);
  controls.registerMethod('rightElement', new Marzipano.ElementPressControlMethod(viewRightElement,  'x',  velocity, friction), true);
  controls.registerMethod('inElement',    new Marzipano.ElementPressControlMethod(viewInElement,  'zoom', -velocity, friction), true);
  controls.registerMethod('outElement',   new Marzipano.ElementPressControlMethod(viewOutElement, 'zoom',  velocity, friction), true);

  function sanitize(s) {
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
  }

  function switchScene(scene) {
    stopAutorotate();
    scene.view.setParameters(scene.data.initialViewParameters);
    scene.scene.switchTo();
    startAutorotate();
    updateSceneName(scene);
    updateSceneList(scene);
  }

  function updateSceneName(scene) {
    sceneNameElement.innerHTML = sanitize(scene.data.name);
  }

  function updateSceneList(scene) {
    for (var i = 0; i < sceneElements.length; i++) {
      var el = sceneElements[i];
      if (el.getAttribute('data-id') === scene.data.id) {
        el.classList.add('current');
      } else {
        el.classList.remove('current');
      }
    }
  }

  function showSceneList() {
    sceneListElement.classList.add('enabled');
    sceneListToggleElement.classList.add('enabled');
  }

  function hideSceneList() {
    sceneListElement.classList.remove('enabled');
    sceneListToggleElement.classList.remove('enabled');
  }

  function toggleSceneList() {
    sceneListElement.classList.toggle('enabled');
    sceneListToggleElement.classList.toggle('enabled');
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
    if (autorotateToggleElement.classList.contains('enabled')) {
      autorotateToggleElement.classList.remove('enabled');
      stopAutorotate();
    } else {
      autorotateToggleElement.classList.add('enabled');
      startAutorotate();
    }
  }

  function createLinkHotspotElement(hotspot) {

    // Create wrapper element to hold icon and tooltip.
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('link-hotspot');

    // Create image element.
    var icon = document.createElement('img');
    icon.src = 'img/link.png';
    icon.classList.add('link-hotspot-icon');

    // Set rotation transform.
    var transformProperties = [ '-ms-transform', '-webkit-transform', 'transform' ];
    for (var i = 0; i < transformProperties.length; i++) {
      var property = transformProperties[i];
      icon.style[property] = 'rotate(' + hotspot.rotation + 'rad)';
    }

    // Add click event handler.
    wrapper.addEventListener('click', function() {
      switchScene(findSceneById(hotspot.target));
    });

    // Prevent touch and scroll events from reaching the parent element.
    // This prevents the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    // Create tooltip element.
    var tooltip = document.createElement('div');
    tooltip.classList.add('hotspot-tooltip');
    tooltip.classList.add('link-hotspot-tooltip');
    tooltip.innerHTML = findSceneDataById(hotspot.target).name;

    wrapper.appendChild(icon);
    wrapper.appendChild(tooltip);

    return wrapper;
  }

  function createInfoHotspotElement(hotspot) {

    // Create wrapper element to hold icon and tooltip.
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('info-hotspot');

    // Create hotspot/tooltip header.
    var header = document.createElement('div');
    header.classList.add('info-hotspot-header');

    // Create image element.
    var iconWrapper = document.createElement('div');
    iconWrapper.classList.add('info-hotspot-icon-wrapper');
    var icon = document.createElement('img');
    icon.src = 'img/info.png';
    icon.classList.add('info-hotspot-icon');
    iconWrapper.appendChild(icon);

    // Create title element.
    var titleWrapper = document.createElement('div');
    titleWrapper.classList.add('info-hotspot-title-wrapper');
    var title = document.createElement('div');
    title.classList.add('info-hotspot-title');
    title.innerHTML = hotspot.title;
    titleWrapper.appendChild(title);

    // Create close element.
    var closeWrapper = document.createElement('div');
    closeWrapper.classList.add('info-hotspot-close-wrapper');
    var closeIcon = document.createElement('img');
    closeIcon.src = 'img/close.png';
    closeIcon.classList.add('info-hotspot-close-icon');
    closeWrapper.appendChild(closeIcon);

    // Construct header element.
    header.appendChild(iconWrapper);
    header.appendChild(titleWrapper);
    header.appendChild(closeWrapper);

    // Create text element.
    var text = document.createElement('div');
    text.classList.add('info-hotspot-text');
    text.innerHTML = hotspot.text;

    // Place header and text into wrapper element.
    wrapper.appendChild(header);
    wrapper.appendChild(text);

    // Create a modal for the hotspot content to appear on mobile mode.
    var modal = document.createElement('div');
    modal.innerHTML = wrapper.innerHTML;
    modal.classList.add('info-hotspot-modal');
    document.body.appendChild(modal);

    var toggle = function() {
      wrapper.classList.toggle('visible');
      modal.classList.toggle('visible');
    };

    // Show content when hotspot is clicked.
    wrapper.querySelector('.info-hotspot-header').addEventListener('click', toggle);

    // Hide content when close icon is clicked.
    modal.querySelector('.info-hotspot-close-wrapper').addEventListener('click', toggle);

    // Prevent touch and scroll events from reaching the parent element.
    // This prevents the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    return wrapper;
  }

  // Prevent touch and scroll events from reaching the parent element.
  function stopTouchAndScrollEventPropagation(element, eventList) {
    var eventList = [ 'touchstart', 'touchmove', 'touchend', 'touchcancel',
                      'wheel', 'mousewheel' ];
    for (var i = 0; i < eventList.length; i++) {
      element.addEventListener(eventList[i], function(event) {
        event.stopPropagation();
      });
    }
  }

  function findSceneById(id) {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].data.id === id) {
        return scenes[i];
      }
    }
    return null;
  }

  function findSceneDataById(id) {
    for (var i = 0; i < data.scenes.length; i++) {
      if (data.scenes[i].id === id) {
        return data.scenes[i];
      }
    }
    return null;
  }

  // --- Menú lateral personalizado ---
const customMenu = document.getElementById('customMenu');
const customMenuToggle = document.getElementById('customMenuToggle');

// Abrir/cerrar menú lateral
customMenuToggle.addEventListener('click', function() {
  customMenu.classList.toggle('open');
});

// Cerrar menú si se hace clic fuera (opcional)
document.addEventListener('click', function(e) {
  if (
    customMenu.classList.contains('open') &&
    !customMenu.contains(e.target) &&
    !customMenuToggle.contains(e.target)
  ) {
    customMenu.classList.remove('open');
  }
});

// --- Zona de título personalizada ---
const customTitleSub = document.getElementById('customTitleSub');

  function updateCustomTitleSub(scene) {
    if (scene && scene.data && scene.data.name) {
      customTitleSub.textContent = scene.data.name;
    }
  }

  // Sobrescribe switchScene ANTES de llamar a switchScene(scenes[0])
  const originalSwitchScene = switchScene;
  switchScene = function(scene) {
    stopAutorotate();
    scene.view.setParameters(scene.data.initialViewParameters);
    scene.scene.switchTo();
    startAutorotate();
    updateSceneList(scene);
    updateCustomTitleSub(scene);
  };

  // Inicializa el subtítulo con la primera escena
  document.addEventListener('DOMContentLoaded', function() {
    if (typeof scenes !== 'undefined' && scenes.length > 0) {
      updateCustomTitleSub(scenes[0]);
    }
    ordenarSceneListPorOrden();
  });
// --- Fin zona título personalizada ---
  // Display the initial scene.
  switchScene(scenes[0]);

  // Order the scene list by the "orden" number in data-id attribute

function ordenarSceneListPorOrden() {
  var sceneList = document.querySelector('#sceneList .scenes');
  var scenes = Array.from(sceneList.querySelectorAll('.scene'));

  scenes.sort(function(a, b) {
    // Extraer los números usando regex
    var matchA = a.getAttribute('data-id').match(/^(\d+)-(\d+)-/);
    var matchB = b.getAttribute('data-id').match(/^(\d+)-(\d+)-/);

    // Si ambos tienen formato válido, ordenar por el segundo número
    if (matchA && matchB) {
      var ordenA = parseInt(matchA[2], 10);
      var ordenB = parseInt(matchB[2], 10);
      return ordenA - ordenB;
    }
    // Si solo A tiene formato válido, va antes
    if (matchA) return -1;
    // Si solo B tiene formato válido, va antes
    if (matchB) return 1;
    // Ninguno tiene formato válido, mantener orden original
    return 0;
  });

  // Limpiar y volver a agregar en el nuevo orden
  scenes.forEach(function(scene) {
    sceneList.appendChild(scene);
  });
}

document.addEventListener('DOMContentLoaded', ordenarSceneListPorOrden);

})();

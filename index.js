/*
 * Preset Search Extension
 * -----------------------
 * Enhances the various preset <select> elements that SillyTavern exposes by
 * turning them into Select2 searchable dropdowns.  Originally this extension
 * only targeted the Chat-Completion preset selector, but SillyTavern has since
 * gained additional preset menus (Context, Instruct, Sys-Prompt, Reasoning,
 * …) that live on the Advanced Settings tab.  This update allows the same
 * convenient search capability across all of those menus.
 *
 * Implementation notes
 * --------------------
 * 1.  We need to make sure that Select2 library is available before we call
 *     $(...).select2().  The library is loaded near the end of <body>, so the
 *     usual `$(document).ready()` callback can fire before it is present.  We
 *     therefore poll until `$.fn.select2` exists.
 * 2.  Each target <select> element might be replaced or emptied/repopulated by
 *     SillyTavern’s own scripts (e.g. when presets are added or renamed).  To
 *     keep things simple we only initialise Select2 once per element – after
 *     that, the Select2 instance will detect option list changes as long as
 *     the original DOM node remains the same.
 */

/* global jQuery */
jQuery(() => {
    // IDs of <select> elements we want to enhance.
    // List of <select> elements that contain potentially long preset lists.
    // Keeping this centralised makes it easier to maintain as the core UI
    // evolves.
    const TARGET_SELECTORS = [
        // Model-specific preset pickers on the main parameters panel
        '#settings_preset',                        // Kobold / TextGen
        '#settings_preset_novel',                  // NovelAI
        '#settings_preset_openai',                 // OpenAI / Chat Completion
        '#settings_preset_textgenerationwebui',    // ooba / vllm / etc.

        // Advanced Settings tab pickers
        '#context_presets',
        '#instruct_presets',
        '#sysprompt_select',
        '#reasoning_select',
    ];

    // Small helper – prefer global isMobile() from SillyTavern if available
    // so that we follow the same logic the core UI uses to decide when a
    // device should be considered “mobile”.  Fallback to a basic UA sniff if
    // the helper is missing (e.g. when running in older builds).
    const isMobileDevice = () => {
        if (typeof window.isMobile === 'function') {
            return window.isMobile();
        }

        // Very light-weight UA heuristic – good enough as a fallback.
        return /iphone|ipad|ipod|android|mobile/i.test(navigator.userAgent);
    };

    const initSelect2 = (selector) => {
        const $el = jQuery(selector);
        if (!$el.length) return; // Element not found – skip.

        // Avoid double-initialisation.
        if ($el.data('select2')) return;

        $el.select2({
            placeholder: 'Select a preset',
            searchInputPlaceholder: 'Search...',
            searchInputCssClass: 'text_pole',
            width: 'resolve',
            // Expand dropdown width to fit its longest option similar to native
            dropdownAutoWidth: true,
            // Ensure the dropdown is attached to the body so it is not clipped
            // by overflow:hidden on ancestor panes.
            dropdownParent: jQuery('body'),
            // Extra CSS classes for easier styling
            dropdownCssClass: 'preset-search-dropdown',
        });

        // On mobile devices, lock body scroll while the dropdown is open to
        // mimic a modal sheet and avoid accidental taps outside the list.
        const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
        const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

        $el.on('select2:open', () => {
            if (isMobile()) {
                document.body.classList.add('preset-search-modal-open');

                const $dd = jQuery('.preset-search-dropdown');

                // Tag iOS platform so CSS can treat it differently (e.g. allow
                // taps outside of the dropdown by skipping the transparent
                // overlay and pointer-blocking).
                if (isIOS()) {
                    $dd.addClass('ios');
                }

                /* -------------------------------------------------------- */
                /*  Prevent bubbling to underlying UI                       */
                /* -------------------------------------------------------- */

                // Some SillyTavern panels listen for document-level clicks to
                // close themselves.  A tap on an empty patch of the dropdown
                // (especially the padded area around the search bar) would
                // bubble up and inadvertently close those panels even though
                // the dropdown visually covers the screen.  We therefore
                // stop propagation for any pointer-type event that originates
                // within the dropdown.

                const stopEvent = (e) => e.stopPropagation();

                $dd.on('click mousedown mouseup pointerdown pointerup touchstart touchend', stopEvent);

                // Remember handler so we can clean up on close.
                $el.data('preset-dd-stop', stopEvent);

                let $overlay = null;
                if (!isIOS()) {
                    // Android – use overlay to block interaction outside the
                    // picker so the underlying UI does not steal gestures.
                    $overlay = jQuery('<div class="preset-search-overlay"></div>').appendTo('body');
                    $overlay.on('pointerdown pointerup pointermove mousedown mouseup click touchstart touchend touchmove', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                    });
                }

                // Overlay blocks interaction with underlying page.  We hook a
                // broad set of pointer-related events to be extra safe on
                // mobile browsers that may emit different sequences (e.g.
                // Safari fires `touchstart` → `pointerdown` → `mousedown`).
                // Any interaction outside the dropdown is therefore consumed
                // by the invisible overlay and never reaches the underlying
                // application UI.
                

                // Prevent the initial tap that triggered the dropdown from
                // immediately selecting an item within the dropdown.
                $dd.css('pointer-events', 'none');
                setTimeout(() => {
                    $dd.css('pointer-events', 'auto');
                }, 250);

                // Disable auto-focus on search input to avoid mobile keyboard pop
                if (isMobile()) {
                    const $inp = $dd.find('.select2-search__field');
                    if ($inp.length) {
                        $inp.prop('readonly', true);
                        // Re-enable on first user tap
                        $inp.one('touchstart mousedown', () => {
                            $inp.prop('readonly', false);
                            // Focus after enabling
                            setTimeout(() => $inp.trigger('focus'), 0);
                        });
                    }
                }

                // (Edge swipe disabled by user request)

                // (Close X button disabled for now)

                // Handle Esc key & Android back button
                const onKey = (e) => {
                    if (e.key === 'Escape') {
                        $el.select2('close');
                    }
                };

                const onPop = () => {
                    // If picker open, close and stop further navigation.
                    $el.select2('close');
                };

                window.addEventListener('keydown', onKey);
                window.addEventListener('popstate', onPop);

                // Push dummy state so back button triggers popstate instead of leaving page
                history.pushState({ presetSearch: true }, '');

                // Store handlers for removal
                $el.data('preset-key-handler', onKey);
                $el.data('preset-pop-handler', onPop);

                // Store overlay for removal on close
                if ($overlay) {
                    $el.data('preset-search-overlay', $overlay);
                }
            }
        });

        $el.on('select2:close', () => {
            document.body.classList.remove('preset-search-modal-open');

            const $overlay = $el.data('preset-search-overlay');
            if ($overlay) {
                $overlay.remove();
                $el.removeData('preset-search-overlay');
            }

            // Remove Esc/back handlers
            const keyHandler = $el.data('preset-key-handler');
            if (keyHandler) {
                window.removeEventListener('keydown', keyHandler);
                $el.removeData('preset-key-handler');
            }

            const popHandler = $el.data('preset-pop-handler');
            if (popHandler) {
                window.removeEventListener('popstate', popHandler);
                $el.removeData('preset-pop-handler');
            }

            // Remove stop-propagation handler attached to dropdown.
            const ddStop = $el.data('preset-dd-stop');
            if (ddStop) {
                const $dd = jQuery('.preset-search-dropdown');
                $dd.off('click mousedown mouseup pointerdown pointerup touchstart touchend', ddStop);
                $el.removeData('preset-dd-stop');
            }

            // If we inserted dummy history state, replace it without firing
            // another popstate to keep history clean and avoid side effects.
            if (history.state && history.state.presetSearch) {
                history.replaceState(null, '', window.location.href);
            }

            // Edge swipe disabled, nothing to detach
        });

        /* -------------------------------------------------- */
        /* Edge swipe gesture (mobile – starts near screen edge) */
        /* -------------------------------------------------- */

        let edgeSwipeActive = false;

        function attachEdgeSwipe($select) {
            if (edgeSwipeActive || !isMobile()) return;

            const EDGE_ZONE = 24;
            const REQ_DISTANCE = 100;
            const TOLERANCE_Y = 60;

            let startX = null;
            let startY = null;

            const onStart = (e) => {
                if (e.touches && e.touches.length === 1) {
                    const t = e.touches[0];
                    if (t.clientX <= EDGE_ZONE || t.clientX >= window.innerWidth - EDGE_ZONE) {
                        startX = t.clientX;
                        startY = t.clientY;
                    }
                }
            };

            const onMove = (e) => {
                if (startX === null) return;
                const t = e.touches[0];
                const dx = t.clientX - startX;
                const dy = t.clientY - startY;

                if (Math.abs(dx) >= REQ_DISTANCE && Math.abs(dy) <= TOLERANCE_Y) {
                    $select.select2('close');
                    reset();
                }
            };

            const onEnd = () => reset();

            function reset() {
                startX = null;
                startY = null;
            }

            window.addEventListener('touchstart', onStart, { passive: true });
            window.addEventListener('touchmove', onMove, { passive: true });
            window.addEventListener('touchend', onEnd, { passive: true });
            window.addEventListener('touchcancel', onEnd, { passive: true });

            edgeSwipeActive = true;

            // Store removal
            $select.data('edgeSwipe-removers', () => {
                window.removeEventListener('touchstart', onStart);
                window.removeEventListener('touchmove', onMove);
                window.removeEventListener('touchend', onEnd);
                window.removeEventListener('touchcancel', onEnd);
            });
        }

        function removeEdgeSwipe() {
            if (!edgeSwipeActive) return;
            const remover = $el.data('edgeSwipe-removers');
            if (remover) remover();
            edgeSwipeActive = false;
            $el.removeData('edgeSwipe-removers');
        }

        // Allow the Select2 container to fill its flex parent (keeps the UI
        // looking identical to the stock <select> behaviour).
        $el.next('.select2-container').addClass('flex1');
    };

    const waitForSelect2AndInit = () => {
        if (typeof jQuery.fn.select2 === 'undefined') {
            // Select2 has not been loaded yet – try again shortly.
            return setTimeout(waitForSelect2AndInit, 100);
        }

        TARGET_SELECTORS.forEach(initSelect2);
    };

    waitForSelect2AndInit();
});

/*
 * Preset Search Extension
 * Adds a searchable dropdown (select2) to the Chat Completion preset selector.
 *
 * This is intentionally simple – it only enhances the existing
 * #settings_preset_openai <select> element that is part of SillyTavern’s
 * settings UI.  The element is available in the DOM at page load time, so
 * we can safely initialize Select2 inside jQuery’s ready handler.
 */

jQuery(() => {
    const selector = '#settings_preset_openai';

    // Make sure the element exists before attempting to enhance it.
    if (!$(selector).length) {
        console.warn('[PresetSearch] Could not find', selector);
        return;
    }

    // Initialise Select2 with the desired options.
    $(selector).select2({
        placeholder: 'Select a preset',
        searchInputPlaceholder: 'Search presets...',
        searchInputCssClass: 'text_pole',
        // Allow the dropdown to match the existing width behaviour.
        width: 'resolve',
    });

    // Flex fill in the surrounding flex layout.
    $(selector).next('.select2-container').addClass('flex1');
});

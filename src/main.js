import './style.css'

import { addPerson, getAllPersons, getAllRelationships, updatePerson } from './modules/db.js'
import { buildTreeData } from './modules/tree-data.js'
import { initTree, renderTree as renderD3Tree, resetZoom, zoomIn, zoomOut } from './modules/tree.js'
import { openPersonDrawer } from './modules/ui.js'

window.__refreshAll = refreshAll
window.__openEditModal = null
window.__openRelationshipModal = null

var allPersons = []
var allRelationships = []

async function init() {
    initTree('tree-svg', function (personData) { openPersonDrawer(personData.id) })
    await refreshAll()
    setupEventListeners()
}

async function refreshAll() {
    allPersons = await getAllPersons()
    allRelationships = await getAllRelationships()
    renderPersonListFromData(allPersons)
    var treeRoots = buildTreeData(allPersons, allRelationships)
    renderD3Tree(treeRoots)
}

function renderPersonListFromData(persons) {
    var listEl = document.getElementById('person-list')
    if (!listEl) return

    if (persons.length === 0) {
        listEl.innerHTML = '<div class="p-6 text-center text-slate-500 text-sm">No persons added yet.</div>'
        return
    }

    listEl.innerHTML = persons.map(function (p) {
        return '<div class="person-list-item flex items-center gap-3 p-3 hover:bg-slate-800/50 cursor-pointer transition-colors border-b border-slate-800/50" data-id="' + p.id + '">' +
            '<div class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ' + genderBadge(p.gender) + '">' +
            (p.photoUrl ? '<img src="' + p.photoUrl + '" class="w-10 h-10 rounded-full object-cover" />' : escapeHtml(p.firstName?.[0] || '?')) +
            '</div>' +
            '<div class="flex-1 min-w-0">' +
            '<p class="text-sm font-medium text-slate-200 truncate">' + escapeHtml(p.firstName) + ' ' + escapeHtml(p.lastName) + '</p>' +
            '<p class="text-xs text-slate-500">' + formatDates(p.birthDate, p.deathDate) + '</p>' +
            '</div></div>'
    }).join('')

    listEl.querySelectorAll('.person-list-item').forEach(function (el) {
        el.addEventListener('click', function () { openPersonDrawer(parseInt(el.dataset.id)) })
    })
}

function setupEventListeners() {
    document.getElementById('btn-add-person')?.addEventListener('click', function () { openPersonModal(null) })
    document.getElementById('btn-export')?.addEventListener('click', function () { openExportModal() })
    document.getElementById('btn-settings')?.addEventListener('click', function () { openSettingsModal() })
    document.getElementById('btn-empty-add')?.addEventListener('click', function () { openPersonModal(null) })

    document.getElementById('btn-zoom-in')?.addEventListener('click', zoomIn)
    document.getElementById('btn-zoom-out')?.addEventListener('click', zoomOut)
    document.getElementById('btn-zoom-reset')?.addEventListener('click', resetZoom)

    var layoutToggle = document.getElementById('btn-layout-toggle')
    layoutToggle?.addEventListener('click', async function () {
        var m = await import('./modules/tree.js')
        m.toggleLayout()
        await refreshAll()
    })

    document.getElementById('mobile-btn-add')?.addEventListener('click', function () { openPersonModal(null) })
    document.getElementById('mobile-btn-export')?.addEventListener('click', function () { openExportModal() })

    import('./modules/ui.js').then(function (ui) {
        window.__openEditModal = function (personId) { ui.openPersonModal(personId) }
        window.__openRelationshipModal = function (personId) { ui.openRelationshipModal(personId) }
    })

    document.getElementById('modal-close')?.addEventListener('click', function () { document.getElementById('person-modal')?.classList.add('hidden') })
    document.getElementById('person-form-cancel')?.addEventListener('click', function () { document.getElementById('person-modal')?.classList.add('hidden') })

    var personForm = document.getElementById('person-form')
    personForm?.addEventListener('submit', async function (e) {
        e.preventDefault()
        var id = document.getElementById('person-id').value
        var data = {
            firstName: document.getElementById('first-name').value.trim(),
            lastName: document.getElementById('last-name').value.trim(),
            birthDate: document.getElementById('birth-date').value || null,
            deathDate: document.getElementById('death-date').value || null,
            gender: document.getElementById('gender').value || '',
            photoUrl: document.getElementById('photo-url').value.trim() || null,
            bio: document.getElementById('bio').value.trim() || '',
        }

        if (!data.firstName || !data.lastName) { alert('First name and last name are required.'); return }

        try {
            if (id) await updatePerson(parseInt(id), data)
            else await addPerson(data)
            document.getElementById('person-modal')?.classList.add('hidden')
            await refreshAll()
        } catch (err) { console.error('Error saving person:', err); alert('Error saving person.') }
    })

    document.getElementById('rel-modal-close')?.addEventListener('click', function () { document.getElementById('relationship-modal')?.classList.add('hidden') })

    document.getElementById('rel-submit')?.addEventListener('click', async function () {
        var personA = parseInt(document.getElementById('rel-person-a').value)
        var personB = parseInt(document.getElementById('rel-person-b').value)
        var type = document.getElementById('rel-type').value

        if (!personA || !personB) { alert('Please select both persons.'); return }
        if (personA === personB) { alert('Cannot link a person to themselves.'); return }

        try {
            var m = await import('./modules/db.js')
            await m.addRelationship(personA, personB, type)
            document.getElementById('relationship-modal')?.classList.add('hidden')
            await refreshAll()
        } catch (err) { console.error('Error creating relationship:', err) }
    })

    document.getElementById('export-modal-close')?.addEventListener('click', function () { document.getElementById('export-modal')?.classList.add('hidden') })

    document.getElementById('export-json')?.addEventListener('click', async function () {
        var m = await import('./modules/db.js')
        var json = await m.exportDatabase()
        downloadFile(json, 'kinkeep-backup.json', 'application/json')
        document.getElementById('export-modal')?.classList.add('hidden')
    })

    document.getElementById('export-gedcom')?.addEventListener('click', async function () {
        var m = await import('./modules/db.js')
        var ged = m.generateGEDCOM(allPersons, allRelationships)
        downloadFile(ged, 'family-tree.ged', 'text/plain')
        document.getElementById('export-modal')?.classList.add('hidden')
    })

    document.getElementById('export-svg')?.addEventListener('click', function () {
        var svgEl = document.getElementById('tree-svg')
        if (!svgEl) return
        var serializer = new XMLSerializer()
        var svgString = serializer.serializeToString(svgEl)
        if (!svgString.includes('xmlns')) svgString = svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
        var blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
        downloadFile(blob, 'family-tree.svg', 'image/svg+xml')
        document.getElementById('export-modal')?.classList.add('hidden')
    })

    document.getElementById('settings-modal-close')?.addEventListener('click', function () { document.getElementById('settings-modal')?.classList.add('hidden') })

    document.getElementById('import-submit')?.addEventListener('click', async function () {
        var fileInput = document.getElementById('import-file')
        if (!fileInput.files.length) { alert('Please select a JSON backup file.'); return }
        var text = await fileInput.files[0].text()
        try {
            var m = await import('./modules/db.js')
            await m.importDatabase(text)
            document.getElementById('settings-modal')?.classList.add('hidden')
            await refreshAll()
            alert('Database imported successfully!')
        } catch (err) { console.error('Import error:', err); alert('Error importing database.') }
    })

    document.getElementById('delete-all')?.addEventListener('click', async function () {
        if (confirm('Delete ALL data? This cannot be undone!')) {
            if (confirm('Really delete every person, relationship, and media file?')) {
                var m = await import('./modules/db.js')
                await m.deleteAllData()
                document.getElementById('settings-modal')?.classList.add('hidden')
                await refreshAll()
            }
        }
    })

    var searchTimeout
    document.getElementById('search-persons')?.addEventListener('input', async function (e) {
        clearTimeout(searchTimeout)
        var query = e.target.value.trim()
        searchTimeout = setTimeout(async function () {
            if (query) { var m = await import('./modules/db.js'); renderPersonListFromData(await m.searchPersons(query)) }
            else renderPersonListFromData(allPersons)
        }, 250)
    });

    ['person-modal', 'relationship-modal', 'export-modal', 'settings-modal'].forEach(function (modalId) {
        var modal = document.getElementById(modalId)
        modal?.addEventListener('click', function (e) { if (e.target === modal) modal.classList.add('hidden') })
    })

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') ['person-modal', 'relationship-modal', 'export-modal', 'settings-modal'].forEach(function (id) { document.getElementById(id)?.classList.add('hidden') })
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); openPersonModal(null) }
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') { e.preventDefault(); openExportModal() }
    })

    var resizeTimeout
    window.addEventListener('resize', function () { clearTimeout(resizeTimeout); resizeTimeout = setTimeout(function () { refreshAll() }, 300) })

    document.getElementById('rel-person-a')?.addEventListener('change', function (e) {
        var sel = parseInt(e.target.value)
        var sb = document.getElementById('rel-person-b')
        if (sel && sb && parseInt(sb.value) === sel) sb.value = ''
    })

    document.getElementById('rel-person-b')?.addEventListener('change', function (e) {
        var sel = parseInt(e.target.value)
        var sa = document.getElementById('rel-person-a')
        if (sel && sa && parseInt(sa.value) === sel) sa.value = ''
    })

    document.getElementById('mobile-btn-list')?.addEventListener('click', function () {
        var sidebar = document.getElementById('sidebar')
        if (sidebar) {
            sidebar.classList.toggle('hidden'); sidebar.classList.toggle('fixed'); sidebar.classList.toggle('inset-0'); sidebar.classList.toggle('z-[70]')
            if (!sidebar.querySelector('.mobile-list-close')) {
                var cb = document.createElement('button'); cb.className = 'mobile-list-close absolute top-2 right-2 z-10 bg-slate-800 text-slate-300 w-8 h-8 rounded-full flex items-center justify-center'; cb.textContent = '\u00d7'
                cb.addEventListener('click', function () { sidebar.classList.add('hidden'); sidebar.classList.remove('fixed', 'inset-0', 'z-[70]') })
                sidebar.appendChild(cb)
            }
            document.querySelectorAll('#mobile-nav button').forEach(function (btn) { btn.classList.remove('text-emerald-400'); btn.classList.add('text-slate-500') })
            document.getElementById('mobile-btn-list')?.classList.add('text-emerald-400')
        }
    })

    window.openPersonModal = openPersonModal

    document.getElementById('btn-add-person')?.addEventListener('dblclick', function () { import('./modules/ui.js').then(function (ui) { ui.openRelationshipModal() }) })
}

async function openPersonModal(personId) {
    if (personId === void 0) personId = null
    var modal = document.getElementById('person-modal')
    var title = document.getElementById('modal-title')
    var form = document.getElementById('person-form')

    form.reset()
    document.getElementById('person-id').value = ''

    if (personId) {
        var person = await import('./modules/db.js').then(function (m) { return m.getPerson(personId) })
        if (!person) return
        title.textContent = 'Edit Person'
        document.getElementById('person-id').value = person.id
        document.getElementById('first-name').value = person.firstName || ''
        document.getElementById('last-name').value = person.lastName || ''
        document.getElementById('birth-date').value = person.birthDate || ''
        document.getElementById('death-date').value = person.deathDate || ''
        document.getElementById('gender').value = person.gender || ''
        document.getElementById('photo-url').value = person.photoUrl || ''
        document.getElementById('bio').value = person.bio || ''
    } else { title.textContent = 'Add Person' }

    modal.classList.remove('hidden')
}

function openExportModal() { document.getElementById('export-modal')?.classList.remove('hidden') }
function openSettingsModal() { document.getElementById('settings-modal')?.classList.remove('hidden') }

function genderBadge(gender) { if (gender === 'male') return 'bg-blue-900/50 text-blue-300'; if (gender === 'female') return 'bg-purple-900/50 text-purple-30'; return 'bg-slate-8 text-slate-4' }

function formatDates(birth, death) { var parts = []; if (birth) parts.push(new Date(birth).getFullYear()); if (death) parts.push(new Date(death).getFullYear()); return parts.join(' - ') || '' }

function escapeHtml(text) { if (!text) return ''; var div = document.createElement('div'); div.textContent = text; return div.innerHTML }

function downloadFile(content, filename, mimeType) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: mimeType })
    var url = URL.createObjectURL(blob)
    var a = document.createElement('a'); a.href = url; a.download = filename
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
}

init()

import { getAllPersons, getPerson, getRelationshipsForPerson, searchPersons } from './db.js'

export async function renderPersonList(query) {
    if (query === void 0) query = ''
    const listEl = document.getElementById('person-list')
    if (!listEl) return

    const persons = query ? await searchPersons(query) : await getAllPersons()

    if (persons.length === 0) {
        listEl.innerHTML = '<div class="p-6 text-center text-slate-500 text-sm">' + (query ? 'No matching persons found.' : 'No persons added yet.') + '</div>'
        return
    }

    listEl.innerHTML = persons.map(function (p) {
        return '<div class="person-list-item flex items-center gap-3 p-3 hover:bg-slate-800/50 cursor-pointer transition-colors border-b border-slate-800/50" data-id="' + p.id + '">' +
            '<div class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ' + genderBg(p.gender) + '">' +
            (p.photoUrl ? '<img src="' + p.photoUrl + '" class="w-10 h-10 rounded-full object-cover" />' : (p.firstName?.[0] || '?')) +
            '</div>' +
            '<div class="flex-1 min-w-0">' +
            '<p class="text-sm font-medium text-slate-200 truncate">' + escapeHtml(p.firstName) + ' ' + escapeHtml(p.lastName) + '</p>' +
            '<p class="text-xs text-slate-500">' + formatDates(p.birthDate, p.deathDate) + '</p>' +
            '</div>' +
            '</div>'
    }).join('')

    listEl.querySelectorAll('.person-list-item').forEach(function (el) {
        el.addEventListener('click', function () { openPersonDrawer(parseInt(el.dataset.id)) })
    })
}

export async function openPersonDrawer(personId) {
    const person = await getPerson(personId)
    if (!person) return

    var relationships = await getRelationshipsForPerson(personId)
    var allPersons = await getAllPersons()

    // Relationship model: {personId: parent, relatedId: child, type: 'parent'}
    // Parents of this person: type='parent' where this person is the relatedId (child side)
    var parents = relationships.filter(function (r) { return r.type === 'parent' && r.relatedId === person.id })
    // Children of this person: type='parent' where this person is the personId (parent side)
    var children = relationships.filter(function (r) { return r.type === 'parent' && r.personId === person.id })
    var spouses = relationships.filter(function (r) { return r.type === 'spouse' })

    function resolveName(id) {
        var p = allPersons.find(function (x) { return x.id === id })
        return p ? p.firstName + ' ' + p.lastName : 'Unknown'
    }

    var parentNames = parents.map(function (r) { return resolveName(r.personId) })
    var childNames = children.map(function (r) { return resolveName(r.relatedId) })
    var spouseNames = spouses.map(function (r) {
        var otherId = r.personId === person.id ? r.relatedId : r.personId
        return resolveName(otherId)
    })

    var drawerContent = buildDrawerContent(person, parentNames, childNames, spouseNames)

    var desktopDrawer = document.getElementById('person-drawer')
    if (desktopDrawer) {
        desktopDrawer.innerHTML = drawerContent
        desktopDrawer.classList.remove('hidden')
        initDrawerSwiper(desktopDrawer)
        attachDrawerHandlers(personId, allPersons)
    }

    var mobileDrawer = document.getElementById('mobile-drawer')
    if (mobileDrawer && window.innerWidth < 768) {
        desktopDrawer.classList.add('hidden')

        var mobileContent = '<div class="p-5">' +
            '<div class="flex items-center justify-between mb-4">' +
            '<h2 class="text-lg font-bold">' + escapeHtml(person.firstName) + ' ' + escapeHtml(person.lastName) + '</h2>' +
            '<button id="mobile-drawer-close" class="text-slate-400 text-xl">&times;</button>' +
            '</div>' +
            '<div class="flex flex-col items-center mb-4">' +
            '<div class="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold mb-2 ' + genderBg(person.gender) + '">' +
            (person.photoUrl ? '<img src="' + person.photoUrl + '" class="w-20 h-20 rounded-full object-cover" />' : (person.firstName?.[0] || '?')) +
            '</div>' +
            '<p class="text-sm text-slate-400">' + formatDates(person.birthDate, person.deathDate) + '</p>' +
            '</div>' +
            '<button class="mobile-edit-btn w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-3 rounded-lg mb-2" data-person-id="' + person.id + '">Edit</button>' +
            '<button class="mobile-rel-btn w-full bg-slate-800 hover:bg-slate-700 text-emerald-400 py-3 rounded-lg mb-2" data-person-id="' + person.id + '">Add Relationship</button>' +
            '<button class="mobile-delete-btn w-full bg-red-900/30 hover:bg-red-900/50 text-red-400 py-3 rounded-lg" data-person-id="' + person.id + '">Delete</button>' +
            '</div>'

        mobileDrawer.innerHTML = mobileContent
        mobileDrawer.classList.remove('hidden')

        document.getElementById('mobile-drawer-close')?.addEventListener('click', function () {
            mobileDrawer.classList.add('hidden')
        })

        mobileDrawer.querySelector('.mobile-edit-btn')?.addEventListener('click', function () {
            window.__openEditModal(person.id)
            mobileDrawer.classList.add('hidden')
        })

        mobileDrawer.querySelector('.mobile-rel-btn')?.addEventListener('click', function () {
            window.__openRelationshipModal(person.id)
            mobileDrawer.classList.add('hidden')
        })

        mobileDrawer.querySelector('.mobile-delete-btn')?.addEventListener('click', async function () {
            if (confirm('Delete ' + person.firstName + ' ' + person.lastName + '?')) {
                var m = await import('./db.js')
                await m.deletePerson(person.id)
                mobileDrawer.classList.add('hidden')
                window.__refreshAll()
            }
        })

        return
    }

    document.getElementById('drawer-close')?.addEventListener('click', function () {
        desktopDrawer.classList.add('hidden')
    })
}

function buildDrawerContent(person, parentNames, childNames, spouseNames) {
    var html = '<div class="h-full flex flex-col min-w-0 overflow-hidden">' +
        '<div class="flex items-center justify-between p-4 border-b border-slate-800">' +
        '<h2 class="text-lg font-bold text-slate-100">' + escapeHtml(person.firstName) + ' ' + escapeHtml(person.lastName) + '</h2>' +
        '<button id="drawer-close" class="text-slate-400 hover:text-white text-xl">&times;</button>' +
        '</div>' +

        '<div class="swiper person-swiper flex-1 min-w-0 min-h-0 w-full overflow-hidden">' +
        '<div class="swiper-wrapper">' +

        '<div class="swiper-slide p-5 min-w-0 overflow-y-auto">' +
        '<div class="flex flex-col items-center mb-6">' +
        '<div class="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold mb-3 ' + genderBg(person.gender) + ' border-2 ' + genderBorder(person.gender) + '">' +
        (person.photoUrl ? '<img src="' + person.photoUrl + '" class="w-24 h-24 rounded-full object-cover" />' : (person.firstName?.[0] || '?')) +
        '</div>' +
        '<h3 class="text-xl font-bold">' + escapeHtml(person.firstName) + ' ' + escapeHtml(person.lastName) + '</h3>' +
        '<p class="text-sm text-slate-400">' + formatDates(person.birthDate, person.deathDate) + '</p>' +
        '</div>' +
        '<div class="space-y-3">' +
        '<div class="bg-slate-800/50 rounded-lg p-3"><p class="text-xs text-slate-500 mb-1">Gender</p><p class="text-sm text-slate-200 capitalize">' + (person.gender || 'Not specified') + '</p></div>' +
        (person.birthDate ? '<div class="bg-slate-800/50 rounded-lg p-3"><p class="text-xs text-slate-500 mb-1">Birth Date</p><p class="text-sm text-slate-200">' + new Date(person.birthDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) + '</p></div>' : '') +
        (person.deathDate ? '<div class="bg-slate-800/50 rounded-lg p-3"><p class="text-xs text-slate-500 mb-1">Death Date</p><p class="text-sm text-slate-200">' + new Date(person.deathDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) + '</p></div>' : '') +
        '</div>' +
        (person.bio ? '<div class="mt-4 bg-slate-800/50 rounded-lg p-3"><p class="text-xs text-slate-500 mb-1">Biography</p><p class="text-sm text-slate-300 whitespace-pre-wrap">' + escapeHtml(person.bio) + '</p></div>' : '') +
        '</div>' +

        '<div class="swiper-slide p-5 min-w-0 overflow-y-auto">' +
        '<h3 class="text-lg font-bold mb-4">Relationships</h3>' +
        (parentNames.length > 0 ? '<div class="mb-4"><p class="text-xs text-slate-500 mb-2 uppercase tracking-wide">Parents (' + parentNames.length + ')</p>' + parentNames.map(function (n) { return '<div class="flex items-center gap-2 bg-slate-800/50 rounded-lg p-2 mb-1"><span class="text-emerald-400">&#8593;</span><span class="text-sm text-slate-200">' + escapeHtml(n) + '</span></div>' }).join('') + '</div>' : '') +
        (spouseNames.length > 0 ? '<div class="mb-4"><p class="text-xs text-slate-500 mb-2 uppercase tracking-wide">Spouse(s) (' + spouseNames.length + ')</p>' + spouseNames.map(function (n) { return '<div class="flex items-center gap-2 bg-slate-800/50 rounded-lg p-2 mb-1"><span class="text-amber-400">&#10084;</span><span class="text-sm text-slate-200">' + escapeHtml(n) + '</span></div>' }).join('') + '</div>' : '') +
        (childNames.length > 0 ? '<div class="mb-4"><p class="text-xs text-slate-500 mb-2 uppercase tracking-wide">Children (' + childNames.length + ')</p>' + childNames.map(function (n) { return '<div class="flex items-center gap-2 bg-slate-800/50 rounded-lg p-2 mb-1"><span class="text-blue-400">&#8595;</span><span class="text-sm text-slate-200">' + escapeHtml(n) + '</span></div>' }).join('') + '</div>' : '') +
        (parentNames.length === 0 && spouseNames.length === 0 && childNames.length === 0 ? '<p class="text-sm text-slate-500 italic">No relationships linked yet.</p>' : '') +
        '<button class="rel-add-btn w-full mt-4 bg-slate-800 hover:bg-slate-700 text-emerald-400 py-2 rounded-lg text-sm font-medium transition-colors" data-person-id="' + person.id + '">+ Add Relationship</button>' +
        '</div>' +

        '<div class="swiper-slide p-5 min-w-0 overflow-y-auto">' +
        '<h3 class="text-lg font-bold mb-4">Edit Person</h3>' +
        '<div class="space-y-2">' +
        '<button class="person-edit-btn w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-3 rounded-lg text-sm transition-colors" data-person-id="' + person.id + '">Edit Person</button>' +
        '<button class="person-delete-btn w-full bg-red-900/30 hover:bg-red-900/50 text-red-400 py-3 rounded-lg text-sm transition-colors" data-person-id="' + person.id + '">Delete Person</button>' +
        '</div>' +
        '<div class="mt-6 bg-slate-800/50 rounded-lg p-4"><p class="text-xs text-slate-500 mb-2">Person ID</p><p class="text-sm font-mono text-slate-300">' + person.id + '</p></div>' +
        (person.bio ? '<div class="mt-4 bg-slate-800/50 rounded-lg p-3"><p class="text-xs text-slate-500 mb-1">Notes</p><p class="text-sm text-slate-300 whitespace-pre-wrap">' + escapeHtml(person.bio) + '</p></div>' : '<div class="mt-4 bg-slate-800/50 rounded-lg p-3 text-center"><p class="text-xs text-slate-500">No notes added yet.</p></div>') +
        '</div>' +

        '</div>' +
        '<div class="swiper-pagination"></div>' +
        '</div>' +
        '<div class="flex flex-shrink-0 border-t border-slate-800">' +
        '<button class="swiper-tab-btn flex-1 py-3 text-xs font-medium text-emerald-400 border-b-2 border-emerald-400 bg-slate-800/30" data-slide="0">Profile</button>' +
        '<button class="swiper-tab-btn flex-1 py-3 text-xs font-medium text-slate-500 hover:text-slate-300" data-slide="1">Links</button>' +
        '<button class="swiper-tab-btn flex-1 py-3 text-xs font-medium text-slate-500 hover:text-slate-300" data-slide="2">Edit</button>' +
        '</div>' +
        '</div>'

    return html
}

function initDrawerSwiper(container) {
    var swiperEl = container.querySelector('.swiper')
    if (!swiperEl) return

    import('swiper').then(function (mod) {
        var Swiper = mod.default
        import('swiper/css').then(function () {
            var swiperInstance = new Swiper(swiperEl, {
                direction: 'horizontal',
                slidesPerView: 1,
                pagination: { el: '.swiper-pagination', clickable: true },
                keyboard: { enabled: true },
                on: { slideChange: function () { updateTabLabels(container, swiperInstance.activeIndex) } }
            })

            container.querySelectorAll('.swiper-tab-btn').forEach(function (btn) {
                btn.addEventListener('click', function () { swiperInstance.slideTo(parseInt(btn.dataset.slide)) })
            })

            updateTabLabels(container, 0)
        })
    })
}

function updateTabLabels(container, activeIndex) {
    container.querySelectorAll('.swiper-tab-btn').forEach(function (btn, i) {
        if (i === activeIndex) {
            btn.classList.add('text-emerald-400', 'border-b-2', 'border-emerald-400', 'bg-slate-800/30')
            btn.classList.remove('text-slate-500')
        } else {
            btn.classList.remove('text-emerald-400', 'border-b-2', 'border-emerald-400', 'bg-slate-800/30')
            btn.classList.add('text-slate-500')
        }
    })
}

function attachDrawerHandlers(personId, allPersons) {
    var container = document.getElementById('person-drawer')

    container.querySelector('.person-edit-btn')?.addEventListener('click', function () { window.__openEditModal(personId) })

    container.querySelector('.person-delete-btn')?.addEventListener('click', async function () {
        var person = await getPerson(personId)
        if (confirm('Delete ' + person?.firstName + ' ' + person?.lastName + '?')) {
            var m = await import('./db.js')
            await m.deletePerson(personId)
            document.getElementById('person-drawer')?.classList.add('hidden')
            window.__refreshAll()
        }
    })

    container.querySelector('.rel-add-btn')?.addEventListener('click', function () { window.__openRelationshipModal(personId) })

    document.getElementById('drawer-close')?.addEventListener('click', function () { document.getElementById('person-drawer')?.classList.add('hidden') })
}

export async function openPersonModal(personId) {
    if (personId === void 0) personId = null
    var modal = document.getElementById('person-modal')
    var title = document.getElementById('modal-title')
    var form = document.getElementById('person-form')

    form.reset()
    document.getElementById('person-id').value = ''

    if (personId) {
        var person = await getPerson(personId)
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
    } else {
        title.textContent = 'Add Person'
    }

    modal.classList.remove('hidden')
}

export function closePersonModal() { document.getElementById('person-modal')?.classList.add('hidden') }

export async function openRelationshipModal(preselectedPersonId) {
    var modal = document.getElementById('relationship-modal')
    var persons = await getAllPersons()

    var selectA = document.getElementById('rel-person-a')
    var selectB = document.getElementById('rel-person-b')

    var optionsHtml = persons.map(function (p) { return '<option value="' + p.id + '">' + escapeHtml(p.firstName) + ' ' + escapeHtml(p.lastName) + '</option>' }).join('')

    selectA.innerHTML = '<option value="">Select Person A</option>' + optionsHtml
    selectB.innerHTML = '<option value="">Select Person B</option>' + optionsHtml

    if (preselectedPersonId) { selectA.value = preselectedPersonId }

    modal.classList.remove('hidden')
}

export function closeRelationshipModal() { document.getElementById('relationship-modal')?.classList.add('hidden') }
export function openExportModal() { document.getElementById('export-modal')?.classList.remove('hidden') }
export function closeExportModal() { document.getElementById('export-modal')?.classList.add('hidden') }
export function openSettingsModal() { document.getElementById('settings-modal')?.classList.remove('hidden') }
export function closeSettingsModal() { document.getElementById('settings-modal')?.classList.add('hidden') }

function genderBg(gender) {
    if (gender === 'male') return 'bg-blue-900/50 text-blue-300'
    if (gender === 'female') return 'bg-purple-900/50 text-purple-300'
    return 'bg-slate-800 text-slate-40'
}

function genderBorder(gender) {
    if (gender === 'male') return 'border-blue-50'
    if (gender === 'female') return 'border-purple-50'
    return 'border-emerald-50'
}

function formatDates(birth, death) {
    var parts = []
    if (birth) parts.push(new Date(birth).getFullYear())
    if (death) parts.push(new Date(death).getFullYear())
    return parts.join(' - ') || ''
}

export function escapeHtml(text) {
    if (!text) return ''
    var div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
}

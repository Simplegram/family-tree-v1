import Dexie from 'dexie'

/**
 * KinKeep Database Module
 * Uses Dexie.js (IndexedDB wrapper) for offline-first relational storage.
 */

export const db = new Dexie('KinKeepDB')

// ─── Schema Definition ───────────────────────────────────────────────
db.version(1).stores({
    persons: `++id, firstName, lastName, birthDate, deathDate, gender`,
    relationships: `++id, personId, relatedId, type`,
    media: `++id, personId, type`
})

// ─── Person CRUD ─────────────────────────────────────────────────────

export async function addPerson(person) {
    const id = await db.persons.add({
        firstName: person.firstName || '',
        lastName: person.lastName || '',
        birthDate: person.birthDate || null,
        deathDate: person.deathDate || null,
        gender: person.gender || '',
        bio: person.bio || '',
        photoUrl: person.photoUrl || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    })

    // Auto-create a placeholder media entry for the photo slot
    if (person.photoUrl) {
        await db.media.add({
            personId: id,
            blob: null,
            url: person.photoUrl,
            type: 'photo',
            caption: '',
            createdAt: new Date().toISOString()
        })
    }

    return id
}

export async function updatePerson(id, updates) {
    await db.persons.update(id, {
        ...updates,
        updatedAt: new Date().toISOString()
    })
}

export async function deletePerson(id) {
    await db.transaction('rw', db.persons, db.relationships, db.media, async () => {
        // Remove all relationships involving this person
        await db.relationships.where((r) => r.personId === id || r.relatedId === id).delete()
        // Remove all media for this person
        await db.media.where('personId').equals(id).delete()
        // Remove the person itself
        await db.persons.delete(id)
    })
}

export async function getPerson(id) {
    return await db.persons.get(id)
}

export async function getAllPersons() {
    return await db.persons.toArray()
}

export async function searchPersons(query) {
    const q = query.toLowerCase()
    const all = await db.persons.toArray()
    return all.filter(
        (p) => p.firstName.toLowerCase().includes(q) || p.lastName.toLowerCase().includes(q)
    )
}

// ─── Relationship CRUD ───────────────────────────────────────────────

export async function addRelationship(personId, relatedId, type) {
    if (type === 'spouse') {
        const existing = await db.relationships.filter(
            (r) => r.type === type &&
                ((r.personId === personId && r.relatedId === relatedId) ||
                    (r.personId === relatedId && r.relatedId === personId))
        ).toArray()

        const id = existing.length > 0 ? existing[0].id : await ensureRelationship(personId, relatedId, type)
        await ensureRelationship(relatedId, personId, type)
        await syncSpouseChildren(personId, relatedId)
        return id
    }

    const id = await ensureRelationship(personId, relatedId, type)

    if (type === 'parent') {
        // If A is parent of B, then B is child of A
        await ensureRelationship(relatedId, personId, 'child')
        await addSpousesAsParents(personId, relatedId)
    } else if (type === 'child') {
        await ensureRelationship(relatedId, personId, 'parent')
        await addSpousesAsParents(relatedId, personId)
    }

    return id
}

async function ensureRelationship(personId, relatedId, type) {
    const existing = await db.relationships.filter(
        (r) => r.personId === personId && r.relatedId === relatedId && r.type === type
    ).toArray()

    if (existing.length > 0) return existing[0].id
    return await db.relationships.add({ personId, relatedId, type })
}

async function addSpousesAsParents(parentId, childId) {
    const spouseIds = await getSpouseIds(parentId)

    for (const spouseId of spouseIds) {
        if (spouseId === childId) continue
        await ensureRelationship(spouseId, childId, 'parent')
        await ensureRelationship(childId, spouseId, 'child')
    }
}

async function syncSpouseChildren(personId, spouseId) {
    const personChildren = await db.relationships.filter(
        (r) => r.type === 'parent' && r.personId === personId
    ).toArray()
    const spouseChildren = await db.relationships.filter(
        (r) => r.type === 'parent' && r.personId === spouseId
    ).toArray()

    for (const rel of personChildren) {
        if (rel.relatedId === spouseId) continue
        await ensureRelationship(spouseId, rel.relatedId, 'parent')
        await ensureRelationship(rel.relatedId, spouseId, 'child')
    }

    for (const rel of spouseChildren) {
        if (rel.relatedId === personId) continue
        await ensureRelationship(personId, rel.relatedId, 'parent')
        await ensureRelationship(rel.relatedId, personId, 'child')
    }
}

async function getSpouseIds(personId) {
    const relationships = await db.relationships.filter(
        (r) => r.type === 'spouse' && (r.personId === personId || r.relatedId === personId)
    ).toArray()

    return [...new Set(relationships.map(function (rel) {
        return rel.personId === personId ? rel.relatedId : rel.personId
    }))]
}

export async function deleteRelationship(id) {
    const rel = await db.relationships.get(id)
    if (!rel) return

    await db.relationships.delete(id)

    // Delete reverse relationship if it exists
    if (['spouse', 'parent', 'child'].includes(rel.type)) {
        const reverseType = rel.type === 'parent' ? 'child' : rel.type === 'child' ? 'parent' : rel.type
        const reverse = await db.relationships.filter(
            (r) => r.personId === rel.relatedId && r.relatedId === rel.personId && r.type === reverseType
        ).toArray()
        for (const r of reverse) {
            await db.relationships.delete(r.id)
        }
    }
}

export async function getRelationshipsForPerson(personId) {
    return await db.relationships.filter(
        (r) => r.personId === personId || r.relatedId === personId
    ).toArray()
}

export async function getAllRelationships() {
    return await db.relationships.toArray()
}

// ─── Media CRUD ──────────────────────────────────────────────────────

export async function addMedia(personId, blob, type, caption) {
    return await db.media.add({
        personId,
        blob,
        type: type || 'photo',
        caption: caption || '',
        createdAt: new Date().toISOString()
    })
}

export async function getMediaForPerson(personId) {
    return await db.media.where('personId').equals(personId).toArray()
}

export async function deleteMedia(id) {
    await db.media.delete(id)
}

// ─── Full Database Export / Import ───────────────────────────────────

export async function exportDatabase() {
    const persons = await db.persons.toArray()
    const relationships = await db.relationships.toArray()
    const media = await db.media.toArray()

    return JSON.stringify({ persons, relationships, media, exportedAt: new Date().toISOString() }, null, 2)
}

export async function importDatabase(jsonString) {
    const data = JSON.parse(jsonString)

    await db.transaction('rw', db.persons, db.relationships, db.media, async () => {
        await db.persons.clear()
        await db.relationships.clear()
        await db.media.clear()

        if (data.persons) {
            for (const p of data.persons) {
                const { id, ...rest } = p
                await db.persons.add(rest)
            }
        }

        if (data.relationships) {
            for (const r of data.relationships) {
                const { id, ...rest } = r
                await db.relationships.add(rest)
            }
        }

        if (data.media) {
            for (const m of data.media) {
                const { id, ...rest } = m
                await db.media.add(rest)
            }
        }
    })

    return true
}

export async function deleteAllData() {
    await db.transaction('rw', db.persons, db.relationships, db.media, async () => {
        await db.persons.clear()
        await db.relationships.clear()
        await db.media.clear()
    })
}

// ─── GEDCOM Export ───────────────────────────────────────────────────

export function generateGEDCOM(persons, relationships) {
    let ged = '0 HEAD\n'
    ged += '1 SOUR KinKeep\n'
    ged += `1 SUBM @SUBMITTER@\n`
    ged += '2 NAME KinKeep App\n'
    ged += `1 FILE KinKeep.ged\n`

    let recordCounter = 0

    // Create person records
    const personRefs = {}
    for (const p of persons) {
        recordCounter++
        const ref = `@I${recordCounter}@`
        personRefs[p.id] = ref

        ged += `0 ${ref} INDI\n`

        if (p.firstName || p.lastName) {
            ged += '1 NAME '
            ged += p.firstName ? `${p.firstName} ` : ''
            ged += p.lastName || ''
            ged += '\n'
        }

        if (p.gender) {
            ged += `1 SEX ${p.gender === 'male' ? 'M' : 'F'}\n`
        }

        if (p.birthDate) {
            ged += '1 BIRT\n'
            ged += `2 DATE ${formatGEDCOMDate(p.birthDate)}\n`
        }

        if (p.deathDate) {
            ged += '1 DEAT\n'
            ged += `2 DATE ${formatGEDCOMDate(p.deathDate)}\n`
        }

        if (p.bio) {
            ged += '1 NOTE\n'
            // Split bio into lines for GEDCOM format
            const lines = p.bio.split('\n')
            for (let i = 0; i < lines.length; i++) {
                const prefix = i === 0 ? '2 ' : '3 '
                ged += `${prefix}${lines[i]}\n`
            }
        }

        ged += '0 ENDR\n'
    }

    // Create family records from spouse relationships (deduplicated)
    const processedFamilies = new Set()
    let familyCounter = 0

    for (const rel of relationships) {
        if (rel.type === 'spouse') {
            // Deduplicate: only process each pair once
            const key = [rel.personId, rel.relatedId].sort().join('-')
            if (processedFamilies.has(key)) continue
            processedFamilies.add(key)

            familyCounter++
            const famRef = `@F${familyCounter}@`

            ged += `0 ${famRef} FAM\n`

            const husbRef = personRefs[rel.personId] || ''
            const wifeRef = personRefs[rel.relatedId] || ''

            ged += `1 HUSB ${husbRef}\n`
            ged += `1 WIFE ${wifeRef}\n`

            // Find children of this couple
            const children = relationships.filter(
                (r) => r.type === 'child' && (r.relatedId === rel.personId || r.relatedId === rel.relatedId)
            )

            for (const childRel of children) {
                const childRef = personRefs[childRel.personId] || ''
                ged += `1 CHIL ${childRef}\n`
            }

            ged += '0 ENDR\n'
        }
    }

    ged += '0 TRL5\n'
    ged += '1 SOUR KinKeep\n'
    ged += '0 ENDI\n'

    return ged
}

function formatGEDCOMDate(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${day} ${month} ${year}`
}

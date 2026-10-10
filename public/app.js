let Achart = null;
let Mchart = null;
let activeEdit = null;
let editPhoto = null;

const maxPhotoSize = 3 * 1024 * 1024;

function showPhotoPreview(previewId, source) {
    const preview = document.getElementById(previewId);
    preview.src = source || '';
    preview.classList.toggle('hidden', !source);
}

function readPhotoFile(file) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        throw new Error('Choose a JPEG, PNG, or WebP image.');
    }
    if (file.size > maxPhotoSize) {
        throw new Error('Images must be 3 MB or smaller.');
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read this image.'));
        reader.readAsDataURL(file);
    });
}

function bindPhotoPreview(inputId, previewId) {
    const input = document.getElementById(inputId);
    input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;

        try {
            showPhotoPreview(previewId, await readPhotoFile(file));
        } catch (error) {
            input.value = '';
            alert(error.message);
        }
    });
}

function openEditModal(type, item) {
    activeEdit = null;
    activeEdit = { type, item };
    const modal = document.getElementById('editModal');
    const title = document.getElementById('editTitle');
    const input = document.getElementById('editValue');
    const inputTotal = document.getElementById('editValueTotal');
    const photoInput = document.getElementById('editPhoto');

    title.textContent = `Edit ${type === 'anime' ? 'anime' : 'manga'}`;
    input.value = type === 'anime' ? (item.watched ?? 0) : (item.readChapters ?? 0);
    inputTotal.value = type === 'anime' ? (item.maxEpisodes ?? 0) : (item.maxChapters ?? 0);
    input.placeholder = type === 'anime' ? 'Episodes watched' : 'Chapters read';

    editPhoto = item.cover || null;
    photoInput.value = '';
    showPhotoPreview('editPhotoPreview', editPhoto);

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    input.focus();
}

function closeEditModal() {
    const modal = document.getElementById('editModal');
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.getElementById('editForm').reset();
    activeEdit = null;
    editPhoto = null;
    showPhotoPreview('editPhotoPreview', null);
}

function clearEditPhoto() {
    editPhoto = null;
    document.getElementById('editPhoto').value = '';
    showPhotoPreview('editPhotoPreview', null);
}

function showAnime() {
    animeSection.style.display = 'block';
    mangaSection.style.display = 'none';

    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('active', tab.textContent.trim() === 'Anime');
    });

    loadAnime();
}

function showManga() {
    animeSection.style.display = 'none';
    mangaSection.style.display = 'block';

    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('active', tab.textContent.trim() === 'Manga');
    });

    loadManga();
}

animeForm.addEventListener('submit', async e => {
    e.preventDefault();

    let cover = null;
    const photoFile = document.getElementById('animePhoto').files[0];
    try {
        if (photoFile) cover = await readPhotoFile(photoFile);
    } catch (error) {
        alert(error.message);
        return;
    }

    const response = await fetch('/api/anime', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            title: animeTitle.value.trim(),
            watched: +animeWatched.value || 0,
            maxEpisodes: +animeMaxEpisodes.value || 0,
            cover
        })
    });

    if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        alert(result.error || 'Could not add this anime.');
        return;
    }

    animeForm.reset();
    showPhotoPreview('animePhotoPreview', null);
    await loadAnime();
});

mangaForm.addEventListener('submit', async e => {
    e.preventDefault();

    let cover = null;
    const photoFile = document.getElementById('mangaPhoto').files[0];
    try {
        if (photoFile) cover = await readPhotoFile(photoFile);
    } catch (error) {
        alert(error.message);
        return;
    }

    const response = await fetch('/api/manga', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            title: mangaTitle.value.trim(),
            readChapters: +mangaReadChapters.value || 0,
            maxChapters: +mangaMaxChapters.value || 0,
            cover
        })
    });

    if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        alert(result.error || 'Could not add this manga.');
        return;
    }

    mangaForm.reset();
    showPhotoPreview('mangaPhotoPreview', null);
    await loadManga();
});

async function loadAnime() {
    let concluidosCount = 0;
    const data = await (await fetch('/api/anime')).json();
    animeList.innerHTML = '';
    data.forEach(a => {
        const p = a.maxEpisodes
            ? Math.round(a.watched / a.maxEpisodes * 100)
            : 0;
        if (p === 100) {
            concluidosCount++;
        }
        animeList.innerHTML += `
<div class="card">

    ${a.cover ? `<img class="cover-image" src="${a.cover}" alt="${a.title} cover">` : ''}

  <h3>${a.title}</h3>

    <p>${a.watched}/${a.maxEpisodes} episodes</p>

    <p>${p}% complete</p>

  <div class="card-actions">
    <button type="button" onclick="editAnime(${a.id})">
    Edit
    </button>

    <button type="button" onclick="deleteAnime(${a.id})">
    Delete
    </button>
  </div>

</div>`;
    });
    if (Achart) {
        Achart.destroy();
    }

    Achart = new Chart(
        document.getElementById('AStatsChart'),
        {
            type: 'bar',
            data: {
                labels: ['Anime Tracked', 'Anime Completed'],
                datasets: [{
                    label: 'Count',
                    data: [data.length, concluidosCount]
                }]
            }
        }
    );
}

async function loadManga() {
    let concluidosCount = 0;
    const data = await (await fetch('/api/manga')).json();
    mangaList.innerHTML = '';
    data.forEach(m => {
        const p = m.maxChapters
            ? Math.round(m.readChapters / m.maxChapters * 100)
            : 0;
        if (p === 100) {
            concluidosCount++;
        }
        mangaList.innerHTML += `
<div class="card">

    ${m.cover ? `<img class="cover-image" src="${m.cover}" alt="${m.title} cover">` : ''}

  <h3>${m.title}</h3>

    <p>${m.readChapters}/${m.maxChapters} chapters</p>

    <p>${p}% complete</p>

  <div class="card-actions">
    <button type="button" onclick="editManga(${m.id})">
    Edit
    </button>

    <button type="button" onclick="deleteManga(${m.id})">
    Delete
    </button>
  </div>

</div>`;
    });
    if (Mchart) {
        Mchart.destroy();
    }

    Mchart = new Chart(
        document.getElementById('MStatsChart'),
        {
            type: 'bar',
            data: {
                labels: ['Manga Tracked', 'Manga Completed'],
                datasets: [{
                    label: 'Count',
                    data: [data.length, concluidosCount]
                }]
            }
        }
    );
}
async function deleteAnime(id) {

    if (!confirm("Delete this anime?"))
        return;

    await fetch(`/api/anime/${id}`, {
        method: 'DELETE'
    });

    loadAnime();
}
async function deleteManga(id) {

    if (!confirm("Delete this manga?")) return;

    await fetch(`/api/manga/${id}`, {
        method: 'DELETE'
    });

    loadManga();
}
async function editAnime(id) {
    const item = (await (await fetch('/api/anime')).json()).find(entry => entry.id === id);
    if (!item) return;
    openEditModal('anime', item);
}

async function editManga(id) {
    const item = (await (await fetch('/api/manga')).json()).find(entry => entry.id === id);
    if (!item) return;
    openEditModal('manga', item);
}

async function submitEditForm(event) {
    event.preventDefault();
    if (!activeEdit) return;

    const { type, item } = activeEdit;

    const value = Number(document.getElementById('editValue').value);
    const valueTotal = Number(document.getElementById('editValueTotal').value);
    const photoFile = document.getElementById('editPhoto').files[0];

    if (!Number.isFinite(value) || !Number.isFinite(valueTotal)) return;

    try {
        if (photoFile) editPhoto = await readPhotoFile(photoFile);
    } catch (error) {
        alert(error.message);
        return;
    }

    const endpoint = type === 'anime' ? `/api/anime/${item.id}` : `/api/manga/${item.id}`;
    const payload = type === 'anime'

        ? { maxEpisodes: valueTotal, watched: value, cover: editPhoto }
        : { maxChapters: valueTotal, readChapters: value, cover: editPhoto };

    try {
        const response = await fetch(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(result.error || `Update failed (${response.status})`);
        }

        closeEditModal();

        if (type === 'anime') {
            await loadAnime();
        } else {
            await loadManga();
        }
    } catch (error) {
        console.error('Error updating item:', error);
        alert(`Could not save changes: ${error.message}`);
    }
}

loadAnime(); loadManga();

document.getElementById('editForm').addEventListener('submit', submitEditForm);
bindPhotoPreview('animePhoto', 'animePhotoPreview');
bindPhotoPreview('mangaPhoto', 'mangaPhotoPreview');
bindPhotoPreview('editPhoto', 'editPhotoPreview');
window.deleteAnime = deleteAnime;
window.deleteManga = deleteManga;
window.editAnime = editAnime;
window.editManga = editManga;
window.closeEditModal = closeEditModal;
window.openEditModal = openEditModal;
window.clearEditPhoto = clearEditPhoto;
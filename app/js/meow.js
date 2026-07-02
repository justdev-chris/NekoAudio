// NekoAudio - Meow Sound Effects

const meowSounds = [
    new Audio('assets/sounds/meow1.mp3'),
    new Audio('assets/sounds/meow2.mp3'),
    new Audio('assets/sounds/meow3.mp3')
];

export function playRandomMeow() {
    const random = Math.floor(Math.random() * meowSounds.length);
    meowSounds[random].currentTime = 0;
    meowSounds[random].play().catch(e => console.log('Meow failed:', e));
}

export function playMeow(index) {
    if (index >= 1 && index <= 3) {
        meowSounds[index - 1].currentTime = 0;
        meowSounds[index - 1].play().catch(e => console.log('Meow failed:', e));
    }
}

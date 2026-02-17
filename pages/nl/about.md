---
layout: page
title: Over mij
lang: nl
permalink: /nl/about/
ref: about-page
weight: 3
---

###### **{{ site.data.strings.about_me[page.lang] }}**

---

Hallo, ik ben **{{ site.author.name }}** :wave:, stedenbbouwkundige, landschapsontwerper en liefhebber van landschappen.<br>
Momenteel woon ik in Nederland, en werk ik aan verschillende projecten in Zuidoost-Azië.
Op deze website presenteer ik mijn meest recente werk en projecten. Om mijn communicatie verbeteren, leer ik actief Nederlands. Daarnaast sta ik open voor nieuwe kansen en ben ik bereid om binnen Nederland te verhuizen als dat nodig is.

<br />

<div class="row">
{% assign skills_title = site.data.strings.skills[page.lang] %}
{% include about/skills.html title=skills_title %}
</div>

<div class="row">
{% assign experience_title = site.data.strings.experiences[page.lang] %}
{% include about/experience.html title=experience_title %}
</div>

<br />

<div class="row">
{% assign education_title = site.data.strings.education[page.lang] %}
{% include about/education.html title=education_title %}
</div>
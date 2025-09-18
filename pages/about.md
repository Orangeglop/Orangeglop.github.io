---
layout: page
title: About
permalink: /about/
weight: 3
---

# **About Me**
---

Hello, I’m **{{ site.author.name }}** :wave:,an architect specialized in urban design, urban planning, and a landscape enthusiast.<br>
I’m currently living in The Netherlands and working as a freelance planner for some projects in Southeast Asia. I am also learning Dutch to improve my communication skill. This website was created to store my most up-to-date portfolio and some featured works. I’m open to work and willingly to move within The Netherlands.

<div style="text-align:center;">
    <video width="100%" autoplay muted playsinline loop preload="auto">
      <source src="/assets/video.mp4" type="video/mp4">
    </video>
</div>

<div class="row">
{% include about/skills.html title="Skills" source=site.data.skills %}
{% include about/skills.html title="Other Skills" source=site.data.other-skills %}
</div>

<div class="row">
{% include about/timeline.html %}
</div>

<div class="row">
{% include about/education.html %}
</div>